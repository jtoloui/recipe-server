import {
  ConverseCommand,
  BedrockRuntimeClient,
  ConverseCommandOutput,
  Tool,
} from '@aws-sdk/client-bedrock-runtime';
import { Logger } from 'winston';

import { bedrockClient } from '@/auth/bedrock';

// EU cross-region inference profile — the bare `anthropic.` id is NOT
// on-demand invokable in eu-west-2.
const MODEL_ID = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
const MAX_ATTEMPTS = 3;

export interface NutritionServiceConfig {
  logger: Logger;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export interface NutritionIngredientInput {
  item: string;
  quantity?: number;
  measurement?: string;
}

export interface NutritionEstimateInput {
  name?: string;
  servings: number;
  ingredients: NutritionIngredientInput[];
}

/**
 * Nutrition block aligned to the EXISTING recipe model `Nutrition` interface
 * (kcal, sugars, salt, carbs, protein, fat, saturates, fibre).
 */
export interface NutritionValues {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  saturates: number;
  fibre: number;
  sugars: number;
  salt: number;
}

export interface NutritionEstimate {
  perServing: NutritionValues;
  perRecipe: NutritionValues;
  servings: number;
  assumptions: string[];
  confidence: 'low' | 'medium' | 'high';
}

const NUM_KEYS = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'saturates',
  'fibre',
  'sugars',
  'salt',
];

// JSON schema for one set of nutrition values (all numbers, grams except kcal).
const valuesSchema = {
  type: 'object',
  properties: NUM_KEYS.reduce<Record<string, unknown>>((acc, k) => {
    acc[k] = { type: 'number', description: k === 'kcal' ? 'energy in kcal' : `${k} in grams` };
    return acc;
  }, {}),
  required: NUM_KEYS,
};

// Tool the model MUST call — this is how we force structured output instead of
// free text we have to parse/fence-strip.
const NUTRITION_TOOL: Tool = {
  toolSpec: {
    name: 'record_nutrition',
    description:
      'Record the estimated nutrition for the recipe (UK conventions: kcal, salt in grams, fibre).',
    inputSchema: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: {
        type: 'object',
        properties: {
          perServing: valuesSchema,
          perRecipe: valuesSchema,
          servings: { type: 'number' },
          assumptions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Portion sizes / substitutions assumed while estimating',
          },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['perServing', 'perRecipe', 'servings', 'assumptions', 'confidence'],
        // The SDK types this as DocumentType; the JSON schema is fine at runtime.
      } as any,
    },
  },
};

export class NutritionServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'NutritionServiceError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class NutritionService {
  private logger: Logger;
  private client: BedrockRuntimeClient;

  constructor(config: NutritionServiceConfig) {
    this.logger = config.logger;
    this.client = bedrockClient({
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
  }

  private buildPrompt(input: NutritionEstimateInput): string {
    const ingredientLines = input.ingredients
      .map((i) => {
        const qty = i.quantity ? `${i.quantity}` : '';
        const meas = i.measurement ? ` ${i.measurement}` : '';
        return `- ${qty}${meas} ${i.item}`.trim();
      })
      .join('\n');

    return [
      'You are a nutrition estimator for a UK recipe app.',
      'Estimate each ingredient individually, then total them, then divide by the number of servings.',
      'Use UK conventions: energy in kcal, salt (not sodium) in grams, "fibre".',
      'State the assumptions you make (portion sizes, fat content, substitutions).',
      'If unsure, still give your best estimate but lower the confidence.',
      'Call the record_nutrition tool with your result. All macro values are grams except kcal.',
      '',
      `Recipe: ${input.name || 'Untitled recipe'}. Servings: ${input.servings}.`,
      'Ingredients:',
      ingredientLines,
    ].join('\n');
  }

  private coerceValues(raw: unknown): NutritionValues {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const out = {} as NutritionValues;
    for (const k of NUM_KEYS as (keyof NutritionValues)[]) {
      const v = Number(obj[k]);
      out[k] = Number.isFinite(v) ? Math.max(0, Math.round(v * 10) / 10) : 0;
    }
    return out;
  }

  private extractToolInput(res: ConverseCommandOutput): Record<string, unknown> {
    const blocks = res.output?.message?.content ?? [];
    for (const b of blocks) {
      if (b.toolUse?.name === 'record_nutrition' && b.toolUse.input) {
        return b.toolUse.input as Record<string, unknown>;
      }
    }
    throw new NutritionServiceError('Model did not return structured nutrition', 502);
  }

  private toEstimate(
    parsed: Record<string, unknown>,
    servings: number,
  ): NutritionEstimate {
    const conf = String(parsed.confidence || 'medium').toLowerCase();
    return {
      perServing: this.coerceValues(parsed.perServing),
      perRecipe: this.coerceValues(parsed.perRecipe),
      servings: Number(parsed.servings) || servings,
      assumptions: Array.isArray(parsed.assumptions)
        ? parsed.assumptions.map((a) => String(a)).slice(0, 20)
        : [],
      confidence: (['low', 'medium', 'high'].includes(conf)
        ? conf
        : 'medium') as NutritionEstimate['confidence'],
    };
  }

  async estimate(input: NutritionEstimateInput): Promise<NutritionEstimate> {
    const command = new ConverseCommand({
      modelId: MODEL_ID,
      messages: [{ role: 'user', content: [{ text: this.buildPrompt(input) }] }],
      toolConfig: {
        tools: [NUTRITION_TOOL],
        // Force the model to call our tool -> guaranteed structured output.
        toolChoice: { tool: { name: 'record_nutrition' } },
      },
      inferenceConfig: { maxTokens: 1024, temperature: 0 },
    });

    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await this.client.send(command);
        const parsed = this.extractToolInput(res);
        return this.toEstimate(parsed, input.servings);
      } catch (error) {
        lastErr = error;
        const retriable =
          !(error instanceof NutritionServiceError) ||
          error.statusCode >= 500;
        this.logger.warn(
          `nutrition estimate attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error}`,
        );
        if (attempt < MAX_ATTEMPTS && retriable) {
          await sleep(300 * attempt); // linear backoff: 300ms, 600ms
          continue;
        }
        break;
      }
    }
    this.logger.error('Bedrock nutrition estimate failed after retries:', lastErr);
    if (lastErr instanceof NutritionServiceError) throw lastErr;
    throw new NutritionServiceError('Nutrition estimation is unavailable', 502);
  }
}

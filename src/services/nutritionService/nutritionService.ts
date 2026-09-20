import {
  ConverseCommand,
  BedrockRuntimeClient,
} from '@aws-sdk/client-bedrock-runtime';
import { Logger } from 'winston';

import { bedrockClient } from '@/auth/bedrock';

// EU cross-region inference profile — the bare `anthropic.` id is NOT
// on-demand invokable in eu-west-2.
const MODEL_ID = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';

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
 * (kcal, sugars, salt, carbs, protein, fat, saturates, fibre) — per serving.
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

const NUM_KEYS: (keyof NutritionValues)[] = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'saturates',
  'fibre',
  'sugars',
  'salt',
];

export class NutritionServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 502,
  ) {
    super(message);
    this.name = 'NutritionServiceError';
  }
}

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
      'Estimate the nutritional content of the recipe below.',
      'Work step by step: estimate each ingredient individually, then total them, then divide by the number of servings.',
      'Use UK conventions: energy in kcal, salt (not sodium) in grams, "fibre".',
      'State the assumptions you make (portion sizes, fat content, etc.).',
      'If you are unsure, still give your best estimate but lower the confidence.',
      '',
      'Return ONLY a JSON object (no markdown, no prose) with this exact shape:',
      '{',
      '  "perServing": { "kcal": n, "protein": n, "carbs": n, "fat": n, "saturates": n, "fibre": n, "sugars": n, "salt": n },',
      '  "perRecipe":  { "kcal": n, "protein": n, "carbs": n, "fat": n, "saturates": n, "fibre": n, "sugars": n, "salt": n },',
      '  "servings": n,',
      '  "assumptions": ["..."],',
      '  "confidence": "low" | "medium" | "high"',
      '}',
      'All macro values are grams except kcal. Numbers only (no units in the values).',
      '',
      `Recipe: ${input.name || 'Untitled recipe'}. Servings: ${input.servings}.`,
      'Ingredients:',
      ingredientLines,
    ].join('\n');
  }

  private coerceValues(raw: unknown): NutritionValues {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const out = {} as NutritionValues;
    for (const k of NUM_KEYS) {
      const v = Number(obj[k]);
      out[k] = Number.isFinite(v) ? Math.max(0, Math.round(v * 10) / 10) : 0;
    }
    return out;
  }

  private parseResponse(text: string, servings: number): NutritionEstimate {
    // Strip markdown fences if the model wrapped the JSON.
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    // Grab the outermost JSON object if there is leading/trailing prose.
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new NutritionServiceError('Model did not return JSON', 502);
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      throw new NutritionServiceError('Model returned invalid JSON', 502);
    }
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
      messages: [
        {
          role: 'user',
          content: [{ text: this.buildPrompt(input) }],
        },
      ],
      inferenceConfig: { maxTokens: 900, temperature: 0 },
    });

    let text: string | undefined;
    try {
      const res = await this.client.send(command);
      text = res.output?.message?.content?.[0]?.text;
    } catch (error) {
      this.logger.error('Bedrock nutrition estimate failed:', error);
      throw new NutritionServiceError('Nutrition estimation is unavailable', 502);
    }
    if (!text) {
      throw new NutritionServiceError('Empty response from nutrition model', 502);
    }
    return this.parseResponse(text, input.servings);
  }
}

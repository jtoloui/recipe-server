import { z } from 'zod';

import { CreateRecipeModelData } from '../models/recipe';

export type CreateRecipeFormData = z.infer<typeof createRecipeSchema>;

export type CreateRecipeFormDataRequest = {
  jsonData: string;
  imageSrc: Express.Multer.File;
};

const Difficulty = z.enum(['Easy', 'Medium', 'Hard'], {
  errorMap: (error) => {
    switch (error.code) {
      case z.ZodIssueCode.invalid_enum_value:
        return {
          message: 'Difficulty must be one of Easy, Medium, or Hard',
        };
      default:
        return {
          message: 'Difficulty is required',
        };
    }
  },
});

export const createRecipeSchema = z.object({
  recipeName: z.string().min(1, "Recipe name can't be empty"),
  recipeDescription: z.string().min(1, "Recipe description can't be empty"),
  vegetarian: z.boolean(),
  vegan: z.boolean(),
  difficulty: Difficulty,
  cuisine: z.string().min(1, "Cuisine can't be empty"),
  prepTime: z
    .number({
      invalid_type_error: 'Prep time must be a number',
    })
    .min(1, 'Prep time must be at least 1 minute'),
  cookTime: z
    .number({
      invalid_type_error: 'Cook time must be a number',
    })
    .min(1, 'Cook time must be at least 1 minute'),
  steps: z
    .array(
      z.object({
        step: z.string().min(1, "Step can't be empty"),
      }),
    )
    .min(1, 'You must have at least one step'),
  ingredients: z
    .array(
      z.object({
        item: z.string().min(1, "Ingredient can't be empty"),
        measurement: z.string().min(1, "Measurement can't be empty"),
        quantity: z
          .number({
            invalid_type_error: 'Quantity must be a number',
          })
          .positive('Quantity must be greater than 0'),
      }),
    )
    .min(1, 'You must have at least one ingredient'),
  nutritionFacts: z.optional(
    z.object({
      kcal: z.number().optional().nullable().nullish(),
      sugars: z.number().optional().nullable().nullish(),
      salt: z.number().optional().nullable().nullish(),
      carbs: z.number().optional().nullable().nullish(),
      protein: z.number().optional().nullable().nullish(),
      fat: z.number().optional().nullable().nullish(),
      saturates: z.number().optional().nullable().nullish(),
      fibre: z.number().optional().nullable().nullish(),
    }),
  ),
  nutritionFactsPerRecipe: z.optional(
    z.object({
      kcal: z.number().optional().nullable().nullish(),
      sugars: z.number().optional().nullable().nullish(),
      salt: z.number().optional().nullable().nullish(),
      carbs: z.number().optional().nullable().nullish(),
      protein: z.number().optional().nullable().nullish(),
      fat: z.number().optional().nullable().nullish(),
      saturates: z.number().optional().nullable().nullish(),
      fibre: z.number().optional().nullable().nullish(),
    }),
  ),
  nutritionMeta: z.optional(
    z.object({
      servings: z.number().optional().nullable().nullish(),
      source: z.string().optional().nullable().nullish(),
      estimatedAt: z.union([z.string(), z.date()]).optional().nullable().nullish(),
    }),
  ),
  labels: z.array(z.string().min(1, 'Must have at least one label')),
  source: z
    .object({
      name: z.string().trim().min(1, "Source name can't be empty"),
      url: z
        .string()
        .trim()
        .url('Source URL must be a valid URL')
        .refine((value) => /^https?:\/\//i.test(value), 'Source URL must use http or https'),
    })
    .optional(),
  visibility: z.enum(['public', 'private'], {
    errorMap: (error) => {
      switch (error.code) {
        case z.ZodIssueCode.invalid_enum_value:
          return {
            message: 'Visibility must be one of public or private',
          };
        default:
          return {
            message: 'Visibility is required',
          };
      }
    },
  }),
  portionSize: z
    .number({
      invalid_type_error: 'Portion size must be a number',
    })
    .min(1, 'Portion size must be at least 1'),
});

export function convertRecipeZodToMongo(
  formData: CreateRecipeFormData,
  image: Express.Multer.File,
): CreateRecipeModelData {
  return {
    name: formData.recipeName,
    image: {
      src: 'TEMP',
      type: image.mimetype,
      originalName: image.originalname,
      storageName: 'TEMP',
    },
    timeToCook: {
      Cook: formData.cookTime,
      Prep: formData.prepTime,
    },
    difficulty: formData.difficulty,
    labels: formData.labels,
    portions: formData.portionSize.toString(),
    description: formData.recipeDescription,
    nutrition: formData.nutritionFacts,
    nutritionPerRecipe: formData.nutritionFactsPerRecipe ?? null,
    nutritionMeta: formData.nutritionMeta
      ? {
          servings: formData.nutritionMeta.servings ?? null,
          source: formData.nutritionMeta.source ?? null,
          estimatedAt: formData.nutritionMeta.estimatedAt
            ? new Date(formData.nutritionMeta.estimatedAt)
            : null,
        }
      : null,
    ingredients: formData.ingredients,
    steps: formData.steps.map((step) => step.step),
    vegan: formData.vegan,
    vegetarian: formData.vegetarian,
    cuisine: formData.cuisine,
    // Only include when supplied so editing a recipe never wipes an existing credit.
    ...(formData.source ? { source: formData.source } : {}),
    visibility: {
      public: formData.visibility === 'public',
      private: formData.visibility === 'private',
      groups: [],
    },
  };
}

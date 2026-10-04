import { describe, expect, it } from 'vitest';

import { convertRecipeZodToMongo, createRecipeSchema } from '@/schemas/createRecipe';

const baseRecipe = {
  recipeName: 'Hash Browns',
  recipeDescription: 'Crispy potato patties',
  vegetarian: true,
  vegan: false,
  difficulty: 'Easy',
  cuisine: 'British',
  prepTime: 15,
  cookTime: 10,
  steps: [{ step: 'Grate the potatoes.' }],
  ingredients: [{ item: 'Potatoes', measurement: 'medium', quantity: 4 }],
  labels: ['Breakfast'],
  visibility: 'public',
  portionSize: 4,
};

const image = { mimetype: 'image/jpeg', originalname: 'hash.jpg' } as Express.Multer.File;

describe('recipe source credit', () => {
  it('accepts and converts an http(s) source', () => {
    const parsed = createRecipeSchema.parse({
      ...baseRecipe,
      source: { name: ' BBC Food ', url: 'https://www.bbc.co.uk/food/recipes/hashbrowns_12454' },
    });

    expect(convertRecipeZodToMongo(parsed, image).source).toEqual({
      name: 'BBC Food',
      url: 'https://www.bbc.co.uk/food/recipes/hashbrowns_12454',
    });
  });

  it('rejects non-http source URLs', () => {
    const result = createRecipeSchema.safeParse({
      ...baseRecipe,
      source: { name: 'Bad', url: 'javascript:alert(1)' },
    });

    expect(result.success).toBe(false);
  });

  it('omits source when absent so edits keep the existing credit', () => {
    const converted = convertRecipeZodToMongo(createRecipeSchema.parse(baseRecipe), image);

    expect(converted).not.toHaveProperty('source');
  });
});

describe('ingredient quantity', () => {
  it('accepts decimal quantities', () => {
    const parsed = createRecipeSchema.parse({
      ...baseRecipe,
      ingredients: [{ item: 'Butter', measurement: 'tablespoons', quantity: 0.5 }],
    });

    expect(parsed.ingredients[0].quantity).toBe(0.5);
  });

  it('rejects zero quantities', () => {
    const result = createRecipeSchema.safeParse({
      ...baseRecipe,
      ingredients: [{ item: 'Butter', measurement: 'tablespoons', quantity: 0 }],
    });

    expect(result.success).toBe(false);
  });
});

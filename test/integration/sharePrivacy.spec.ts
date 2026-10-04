import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import RecipeModel from '@/models/recipe';
import { findPublicRecipe } from '@/og/shareRoutes';

const base = {
  recipeAuthor: 'Jamie T',
  timeToCook: { Cook: 10, Prep: 15 },
  difficulty: 'Easy',
  labels: ['Breakfast'],
  portions: '4',
  description: 'Crispy potato patties',
  ingredients: [{ item: 'Potatoes', measurement: 'medium', quantity: 4 }],
  steps: ['Grate.'],
  vegan: false,
  vegetarian: true,
  cuisine: 'British',
  creatorId: 'secret-creator-id',
  image: { src: 'https://media/x.jpg', type: 'image/jpeg', originalName: 'x.jpg', storageName: 'abc-x.jpg' },
};

describe('findPublicRecipe privacy filter', () => {
  let publicId = '';
  let privateId = '';
  let legacyId = '';

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'share-privacy' });
    const [pub, priv] = await RecipeModel.create([
      { ...base, name: 'Public', visibility: { public: true, private: false, groups: [] } },
      { ...base, name: 'Private', visibility: { public: false, private: true, groups: [] } },
    ]);
    publicId = String(pub._id);
    privateId = String(priv._id);
    // Legacy document with no visibility at all (inserted raw, bypassing defaults).
    const legacy = await RecipeModel.collection.insertOne({ ...base, name: 'Legacy' });
    legacyId = String(legacy.insertedId);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('returns preview fields for a public recipe', async () => {
    const recipe = await findPublicRecipe(publicId);
    expect(recipe).toMatchObject({ id: publicId, name: 'Public', storageName: 'abc-x.jpg', cuisine: 'British' });
  });

  it('never returns private recipes', async () => {
    expect(await findPublicRecipe(privateId)).toBeNull();
  });

  it('treats legacy recipes without visibility as public', async () => {
    expect((await findPublicRecipe(legacyId))?.name).toBe('Legacy');
  });

  it('exposes only preview fields', async () => {
    const recipe = await findPublicRecipe(publicId);
    expect(Object.keys(recipe ?? {}).sort()).toEqual(
      ['cuisine', 'description', 'id', 'name', 'portions', 'storageName', 'timeToCook', 'updatedAt'].sort(),
    );
    expect(JSON.stringify(recipe)).not.toContain('secret-creator-id');
  });

  it('rejects invalid ids without querying', async () => {
    expect(await findPublicRecipe('not-an-id')).toBeNull();
  });
});

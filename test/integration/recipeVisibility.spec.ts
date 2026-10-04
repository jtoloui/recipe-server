import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Stand-in auth: the test picks the user via a header.
vi.mock('@/middleware/authenticated', () => ({
  isAuthenticated: (req: Request, res: Response, next: NextFunction) => {
    const sub = req.header('x-test-user');
    if (!sub) return res.status(401).json({ message: 'Unauthorized' });
    (req as unknown as { session: { user: { sub: string } } }).session = { user: { sub } };
    return next();
  },
}));

import RecipeModel from '@/models/recipe';
import { labelRoutes } from '@/routes/labelRoutes';
import { recipeRoutes } from '@/routes/recipeRoutes';
import type { ConfigType } from '@/types/config/config';

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const config = {
  logLevel: 'error',
  newLogger: () => logger,
  awsRegion: 'eu-west-2',
  awsS3BucketName: 'test',
  awsAccessKeyId: 'test',
  awsSecretAccessKey: 'test',
} as unknown as ConfigType;

const app = express();
app.use(express.json());
app.use('/api/recipes', recipeRoutes(config));
app.use('/api/labels', labelRoutes(config));

const base = {
  recipeAuthor: 'Owner',
  timeToCook: { Cook: 10, Prep: 5 },
  difficulty: 'Easy',
  portions: '2',
  description: 'desc',
  ingredients: [{ item: 'Egg', measurement: 'count', quantity: 1 }],
  steps: ['Cook.'],
  vegan: false,
  vegetarian: true,
  cuisine: 'British',
  image: { src: 'x', type: 'image/jpeg', originalName: 'x.jpg', storageName: 'x.jpg' },
};

let publicId = '';
let privateId = '';
let legacyId = '';

const as = (user: string) => (url: string) => request(app).get(url).set('x-test-user', user);
const names = (body: { name: string }[]) => body.map((r) => r.name).sort();

describe('recipe visibility', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'visibility-test' });
    const [pub, priv] = await RecipeModel.create([
      { ...base, name: 'Public', labels: ['Secretlabel'], creatorId: 'bob', visibility: { public: true, private: false, groups: [] } },
      { ...base, name: 'Bob private', labels: ['Secretlabel'], creatorId: 'bob', visibility: { public: false, private: true, groups: [] } },
    ]);
    publicId = String(pub._id);
    privateId = String(priv._id);
    const legacy = await RecipeModel.collection.insertOne({ ...base, name: 'Legacy', labels: ['Secretlabel'], creatorId: 'bob' });
    legacyId = String(legacy.insertedId);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  describe('GET /api/recipes/:id', () => {
    it("returns 404 for someone else's private recipe", async () => {
      const res = await as('alice')(`/api/recipes/${privateId}`);
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('Bob private');
    });

    it('returns your own private recipe', async () => {
      const res = await as('bob')(`/api/recipes/${privateId}`);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Bob private', isAuthor: true });
    });

    it('returns public and legacy recipes to anyone', async () => {
      expect((await as('alice')(`/api/recipes/${publicId}`)).status).toBe(200);
      expect((await as('alice')(`/api/recipes/${legacyId}`)).status).toBe(200);
    });

    it('still rejects malformed ids with 400', async () => {
      expect((await as('alice')('/api/recipes/not-an-id')).status).toBe(400);
    });
  });

  describe('label endpoints', () => {
    it("hide others' private recipes in /labels/all and /labels/:label", async () => {
      expect(names((await as('alice')('/api/labels/all')).body)).toEqual(['Legacy', 'Public']);
      expect(names((await as('alice')('/api/labels/Secretlabel')).body)).toEqual(['Legacy', 'Public']);
    });

    it('include your own private recipes', async () => {
      expect(names((await as('bob')('/api/labels/Secretlabel')).body)).toEqual(['Bob private', 'Legacy', 'Public']);
    });

    it('do not count private recipes in label totals', async () => {
      const res = await as('alice')('/api/labels');
      const secret = res.body.labelCounts.find((l: { label: string }) => l.label === 'Secretlabel');
      expect(secret.count).toBe(2);
      expect(res.body.totalRecipes).toBe(2);
    });

    it('treat label input as text, not a regex', async () => {
      const res = await as('alice')('/api/labels/.*');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/recipes metadata', () => {
    const labelCount = (labels: { label: string; count: number }[], name: string) =>
      labels.find((l) => l.label === name)?.count ?? 0;

    it('counts only recipes the user can see', async () => {
      const res = await as('alice')('/api/recipes');
      expect(res.body.recipes).toHaveLength(2);
      expect(res.body.meta.totalRecipes).toBe(2);
      expect(res.body.meta.totalRecipesMatching).toBe(2);
      expect(labelCount(res.body.meta.availableLabels, 'Secretlabel')).toBe(2);
      expect(labelCount(res.body.meta.allLabels, 'Secretlabel')).toBe(2);
    });

    it('returns no available labels when a search matches nothing', async () => {
      const res = await as('alice')('/api/recipes?search=zzznothing');
      expect(res.body.recipes).toHaveLength(0);
      expect(res.body.meta.availableLabels).toEqual([]);
      expect(res.body.meta.totalRecipesMatching).toBe(0);
    });

    it('scopes available labels to the search', async () => {
      const res = await as('alice')('/api/recipes?search=Legacy');
      expect(res.body.recipes.map((r: { name: string }) => r.name)).toEqual(['Legacy']);
      expect(res.body.meta.totalRecipesMatching).toBe(1);
      expect(labelCount(res.body.meta.availableLabels, 'Secretlabel')).toBe(1);
    });
  });
});

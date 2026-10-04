import express, { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stand-in auth: the test picks the user via a header; no header = 401.
vi.mock('@/middleware/authenticated', () => ({
  isAuthenticated: (req: Request, res: Response, next: NextFunction) => {
    const sub = req.header('x-test-user');
    if (!sub) return res.status(401).json({ message: 'Unauthorized' });
    (req as unknown as { session: { user: { sub: string } } }).session = { user: { sub } };
    return next();
  },
}));

import FavouriteModel from '@/models/favourite';
import RecipeModel from '@/models/recipe';
import { favouriteRoutes } from '@/routes/favouriteRoutes';
import type { ConfigType } from '@/types/config/config';

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
const config = { logLevel: 'error', newLogger: () => logger } as unknown as ConfigType;

const app = express();
app.use(express.json());
app.use('/api/favourites', favouriteRoutes(config));

const base = {
  recipeAuthor: 'Jamie T',
  timeToCook: { Cook: 10, Prep: 15 },
  difficulty: 'Easy',
  labels: ['Breakfast'],
  portions: '4',
  description: 'desc',
  ingredients: [{ item: 'Potatoes', measurement: 'medium', quantity: 4 }],
  steps: ['Grate.'],
  vegan: false,
  vegetarian: true,
  cuisine: 'British',
  image: { src: 'https://media/x.jpg', type: 'image/jpeg', originalName: 'x.jpg', storageName: 'x.jpg' },
};

let publicId = '';
let otherPrivateId = '';
let ownPrivateId = '';

const as = (user: string) => ({
  get: (url: string) => request(app).get(url).set('x-test-user', user),
  put: (url: string) => request(app).put(url).set('x-test-user', user),
  del: (url: string) => request(app).delete(url).set('x-test-user', user),
});

describe('favourites API', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'favourites-test' });
    await FavouriteModel.syncIndexes();
    const [pub, otherPriv, ownPriv] = await RecipeModel.create([
      { ...base, name: 'Public', creatorId: 'bob', visibility: { public: true, private: false, groups: [] } },
      { ...base, name: 'Bob private', creatorId: 'bob', visibility: { public: false, private: true, groups: [] } },
      { ...base, name: 'Alice private', creatorId: 'alice', visibility: { public: false, private: true, groups: [] } },
    ]);
    publicId = String(pub._id);
    otherPrivateId = String(otherPriv._id);
    ownPrivateId = String(ownPriv._id);
  });

  beforeEach(async () => {
    await FavouriteModel.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/api/favourites')).status).toBe(401);
  });

  it('adds idempotently and lists ids', async () => {
    expect((await as('alice').put(`/api/favourites/${publicId}`)).status).toBe(200);
    expect((await as('alice').put(`/api/favourites/${publicId}`)).status).toBe(200);

    const res = await as('alice').get('/api/favourites');
    expect(res.body).toEqual({ recipeIds: [publicId] });
    expect(await FavouriteModel.countDocuments({ userId: 'alice' })).toBe(1);
  });

  it('handles concurrent duplicate adds without errors', async () => {
    const results = await Promise.all([1, 2, 3].map(() => as('alice').put(`/api/favourites/${publicId}`)));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await FavouriteModel.countDocuments({ userId: 'alice' })).toBe(1);
  });

  it('removes idempotently', async () => {
    await as('alice').put(`/api/favourites/${publicId}`);
    expect((await as('alice').del(`/api/favourites/${publicId}`)).body).toEqual({
      recipeId: publicId,
      favourited: false,
    });
    expect((await as('alice').del(`/api/favourites/${publicId}`)).status).toBe(200);
    expect((await as('alice').get('/api/favourites')).body.recipeIds).toEqual([]);
  });

  it("keeps each user's favourites separate", async () => {
    await as('alice').put(`/api/favourites/${publicId}`);
    expect((await as('bob').get('/api/favourites')).body.recipeIds).toEqual([]);
  });

  it("refuses to favourite someone else's private recipe", async () => {
    expect((await as('alice').put(`/api/favourites/${otherPrivateId}`)).status).toBe(404);
  });

  it('allows favouriting your own private recipe', async () => {
    expect((await as('alice').put(`/api/favourites/${ownPrivateId}`)).status).toBe(200);
  });

  it('returns favourited recipes newest first, hiding ones no longer visible', async () => {
    await as('alice').put(`/api/favourites/${publicId}`);
    await new Promise((r) => setTimeout(r, 10));
    await as('alice').put(`/api/favourites/${ownPrivateId}`);
    // A stale favourite for a recipe that is now private to someone else.
    await FavouriteModel.create({ userId: 'alice', recipeId: otherPrivateId });

    const res = await as('alice').get('/api/favourites/recipes');
    expect(res.status).toBe(200);
    expect(res.body.recipes.map((r: { name: string }) => r.name)).toEqual(['Alice private', 'Public']);
    expect(res.body.recipes[0]).toHaveProperty('image');
    expect(res.body.recipes[0].timeToCook).toHaveProperty('totalTime');
    expect(res.body.recipes[0]).not.toHaveProperty('steps');
  });

  it('rejects invalid ids', async () => {
    expect((await as('alice').put('/api/favourites/not-an-id')).status).toBe(400);
    expect((await as('alice').del('/api/favourites/not-an-id')).status).toBe(400);
    // 12-char strings are accepted by isValidObjectId; must still be rejected.
    expect((await as('alice').put('/api/favourites/aaaaaaaaaaaa')).status).toBe(400);
  });

  it('404s for unknown recipes', async () => {
    expect((await as('alice').put(`/api/favourites/${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });
});

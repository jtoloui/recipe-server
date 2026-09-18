import mongoose from 'mongoose';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { clearCollections } from '../setup/mongo';

// D2 regression: the recipe read path used to wrap read-only queries in a Mongo
// transaction (un-awaited commit, and transactions REQUIRE a replica set — they
// throw on a standalone mongod like mongodb-memory-server here). Proving a
// straight find works against standalone Mongo is the environment half of D2;
// the service-level assertion lives with the service once its AWS deps are
// stubbed (later in this phase). This pins that standalone reads succeed.
describe('standalone Mongo read (D2 environment regression)', () => {
  beforeAll(async () => {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'recipe' });
    }
  });

  afterEach(async () => {
    await clearCollections();
  });

  it('reads without requiring a transaction/replica set', async () => {
    const Recipe =
      mongoose.models.RecipeD2 ||
      mongoose.model('RecipeD2', new mongoose.Schema({ name: String, labels: [String] }));
    await Recipe.create({ name: 'ragu', labels: ['pasta', 'italian'] });

    // A plain find — the shape the de-transactioned service now uses.
    const found = await Recipe.find({ 'labels': 'pasta' }).lean();
    expect(found).toHaveLength(1);
    expect(found[0].name).toBe('ragu');
  });
});

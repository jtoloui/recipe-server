import mongoose from 'mongoose';
import { afterEach, describe, expect, it } from 'vitest';

import { clearCollections } from '../setup/mongo';

// Smoke test proving the in-memory Mongo harness works end to end: connect,
// write, read, isolate. This is the foundation the data-layer integration
// tests (D2/D3) build on.
describe('mongodb-memory-server harness', () => {
  afterEach(async () => {
    if (mongoose.connection.readyState === 1) await clearCollections();
  });

  it('connects to the in-memory instance set up in global setup', async () => {
    await mongoose.connect(process.env.MONGODB_URI as string, { dbName: 'recipe' });
    expect(mongoose.connection.readyState).toBe(1); // connected
  });

  it('round-trips a document', async () => {
    const Thing = mongoose.models.Thing || mongoose.model('Thing', new mongoose.Schema({ name: String }));
    await Thing.create({ name: 'pasta' });
    const found = await Thing.findOne({ name: 'pasta' }).lean();
    expect(found?.name).toBe('pasta');
  });
});

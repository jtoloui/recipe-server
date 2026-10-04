import express from 'express';
import sharp from 'sharp';
import request from 'supertest';
import type { Logger } from 'winston';
import { describe, expect, it, vi } from 'vitest';

import { OG_DEFAULT_JPEG } from '@/og/brandAssets';
import { renderRecipeOgImage } from '@/og/ogImage';
import { ShareDeps, shareRoutes } from '@/og/shareRoutes';
import { buildRecipeTags, escapeHtml, injectTags, truncate } from '@/og/shareTags';

const ID = '6ac2957c5840465fb86cfdaa';
const urls = { webBase: 'https://www.justcook.ing', apiBase: 'https://api.justcook.ing' };
const TEMPLATE = `<!doctype html><html><head><meta charset="UTF-8" />
<!-- og:start (defaults) --><title>JustCooking</title><meta property="og:title" content="JustCooking" /><!-- og:end -->
</head><body><div id="root"></div></body></html>`;

const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;

const recipe = {
  id: ID,
  name: 'Hash Browns',
  description: 'Crispy pan-fried patties of grated potato and onion.',
  portions: '4',
  cuisine: 'British',
  timeToCook: { Prep: 15, Cook: 10 },
  updatedAt: new Date('2026-10-04T18:23:00Z'),
  storageName: `${ID}-hash.jpeg`,
};

const appWith = (overrides: Partial<ShareDeps> = {}) => {
  const deps: ShareDeps = {
    urls,
    logger,
    connect: vi.fn().mockResolvedValue(undefined),
    findPublicRecipe: vi.fn().mockResolvedValue(recipe),
    fetchIndexHtml: vi.fn().mockResolvedValue(TEMPLATE),
    fetchPhoto: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  const app = express();
  app.use(shareRoutes(deps));
  return { app, deps };
};

describe('share tags', () => {
  it('escapes HTML-significant characters', () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe(
      '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;',
    );
  });

  it('truncates on a word boundary', () => {
    expect(truncate('one two three four five', 14)).toBe('one two three…');
  });

  it('builds complete OG + Twitter tags with a versioned image URL', () => {
    const tags = buildRecipeTags(recipe, urls);
    expect(tags).toContain('<meta property="og:title" content="Hash Browns" />');
    expect(tags).toContain('Ready in 25 mins · Serves 4 · British');
    expect(tags).toContain(`https://www.justcook.ing/api/og/recipe/${ID}.jpg?v=${recipe.updatedAt.getTime()}`);
    expect(tags).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(tags).toContain('<meta property="og:site_name" content="JustCooking" />');
    expect(tags).toContain(`<meta property="og:url" content="https://www.justcook.ing/recipe/${ID}" />`);
  });

  it('cannot break out of attributes via recipe data', () => {
    const tags = buildRecipeTags({ ...recipe, name: '"/><script>x</script>' }, urls);
    expect(tags).not.toContain('<script>');
  });

  it('leaves HTML untouched when markers are missing', () => {
    expect(injectTags('<head></head>', 'X')).toBe('<head></head>');
  });
});

describe('GET /recipe/:id', () => {
  it('injects the recipe preview for a public recipe', async () => {
    const { app } = appWith();
    const res = await request(app).get(`/recipe/${ID}`).set('User-Agent', 'WhatsApp/2.23');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('<title>Hash Browns | JustCooking</title>');
    expect(res.text).not.toContain('content="JustCooking" />\n<!-- og:end');
    expect(res.text).toContain('<div id="root"></div>');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('serves the site defaults for private or unknown recipes', async () => {
    const { app } = appWith({ findPublicRecipe: vi.fn().mockResolvedValue(null) });
    const res = await request(app).get(`/recipe/${ID}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
  });

  it('does not query the database for malformed ids', async () => {
    const { app, deps } = appWith();
    const res = await request(app).get('/recipe/not-an-id');

    expect(res.text).toBe(TEMPLATE);
    expect(deps.findPublicRecipe).not.toHaveBeenCalled();
  });

  it('still serves the SPA when the recipe lookup fails', async () => {
    const { app } = appWith({ connect: vi.fn().mockRejectedValue(new Error('db down')) });
    const res = await request(app).get(`/recipe/${ID}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
  });

  it('returns 502 so CloudFront can fail over when index.html is unavailable', async () => {
    const { app } = appWith({ fetchIndexHtml: vi.fn().mockRejectedValue(new Error('timeout')) });
    const res = await request(app).get(`/recipe/${ID}`);

    expect(res.status).toBe(502);
  });

  it('serves defaults quickly with a short cache when the database is slow', async () => {
    const { app } = appWith({ connect: () => new Promise(() => undefined) });
    const started = Date.now();
    const res = await request(app).get(`/recipe/${ID}`);

    expect(res.status).toBe(200);
    expect(res.text).toBe(TEMPLATE);
    expect(Date.now() - started).toBeLessThan(2500);
    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });

  it('caches real recipe pages for 5 minutes at the edge', async () => {
    const { app } = appWith();
    const res = await request(app).get(`/recipe/${ID}`);

    expect(res.headers['cache-control']).toContain('s-maxage=300');
  });

  it('supports HEAD requests from crawlers', async () => {
    const { app } = appWith();
    const res = await request(app).head(`/recipe/${ID}`);

    expect(res.status).toBe(200);
  });
});

describe('GET /api/og/recipe/:id.jpg', () => {
  it('returns the default card when there is no photo', async () => {
    const { app } = appWith();
    const res = await request(app).get(`/api/og/recipe/${ID}.jpg`).buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(res.body, OG_DEFAULT_JPEG)).toBe(0);
  });

  it('never fetches photos for private recipes', async () => {
    const fetchPhoto = vi.fn();
    const { app } = appWith({ findPublicRecipe: vi.fn().mockResolvedValue(null), fetchPhoto });
    const res = await request(app).get(`/api/og/recipe/${ID}.jpg`);

    expect(res.status).toBe(200);
    expect(fetchPhoto).not.toHaveBeenCalled();
  });

  it('renders a 1200x630 JPEG under 300KB from a food photo', async () => {
    const photo = await sharp({
      create: { width: 2150, height: 2364, channels: 3, background: { r: 200, g: 140, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const { app } = appWith({ fetchPhoto: vi.fn().mockResolvedValue(photo) });
    const res = await request(app).get(`/api/og/recipe/${ID}.jpg`).buffer(true);
    const meta = await sharp(res.body).metadata();

    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(meta.format).toBe('jpeg');
    expect(res.body.length).toBeLessThan(300 * 1024);
  });

  it('falls back to the default card for corrupt photos', async () => {
    expect(await renderRecipeOgImage(Buffer.from('not an image'))).toBe(OG_DEFAULT_JPEG);
  });

  it('short-caches the fallback card when the photo cannot be rendered', async () => {
    const { app } = appWith({ fetchPhoto: vi.fn().mockResolvedValue(Buffer.from('corrupt')) });
    const res = await request(app).get(`/api/og/recipe/${ID}.jpg`);

    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });

  it('long-caches successfully rendered previews', async () => {
    const photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 120, b: 60 } },
    })
      .jpeg()
      .toBuffer();
    const { app } = appWith({ fetchPhoto: vi.fn().mockResolvedValue(photo) });
    const res = await request(app).get(`/api/og/recipe/${ID}.jpg`);

    expect(res.headers['cache-control']).toContain('s-maxage=604800');
  });
});

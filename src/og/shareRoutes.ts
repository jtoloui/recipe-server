import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Request, Response, Router } from 'express';
import mongoose from 'mongoose';
import { Logger } from 'winston';

import RecipeModel from '@/models/recipe';

import { OG_DEFAULT_JPEG } from './brandAssets';
import { renderRecipeOgImage } from './ogImage';
import { ShareRecipe, ShareUrls, buildRecipeTags, injectTags } from './shareTags';

interface PublicRecipe extends ShareRecipe {
  storageName?: string | null;
}

export interface ShareDeps {
  urls: ShareUrls;
  logger: Logger;
  /** Ensure the DB connection is live before querying. */
  connect: () => Promise<unknown>;
  /** Return the recipe only when it is public, otherwise null. */
  findPublicRecipe: (id: string) => Promise<PublicRecipe | null>;
  /** Fetch the SPA's index.html (template for the share page). */
  fetchIndexHtml: () => Promise<string>;
  /** Fetch the stored food photo bytes, or null when unavailable. */
  fetchPhoto: (storageName: string) => Promise<Buffer | null>;
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const HTML_CACHE_MS = 60_000;
const IMAGE_CACHE_LIMIT = 40;
/** Real visitors also hit this route — never make them wait on a slow DB. */
const LOOKUP_TIMEOUT_MS = 1500;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
/** Cache headers: long for real results, short when we fell back on an error. */
const HTML_OK_CACHE = 'public, max-age=0, s-maxage=300';
const SHORT_CACHE = 'public, max-age=0, s-maxage=60';
const IMAGE_OK_CACHE = 'public, max-age=86400, s-maxage=604800';

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const isUsableStorageName = (name?: string | null): name is string =>
  !!name && name !== 'N/A' && name !== 'TEMP' && !name.includes('..') && !name.startsWith('/');

export const shareRoutes = (deps: ShareDeps) => {
  const router = Router();
  let template: { html: string; at: number } | null = null;
  const imageCache = new Map<string, Buffer>();

  const getTemplate = async () => {
    if (template && Date.now() - template.at < HTML_CACHE_MS) return template.html;
    const html = await deps.fetchIndexHtml();
    template = { html, at: Date.now() };
    return html;
  };

  const lookup = async (id: string) => {
    if (!OBJECT_ID.test(id)) return null;
    return withTimeout(
      (async () => {
        await deps.connect();
        return deps.findPublicRecipe(id);
      })(),
      LOOKUP_TIMEOUT_MS,
    );
  };

  // The SPA page for a recipe, with that recipe's preview tags. Private or
  // unknown recipes get the unmodified site-wide defaults (no data leaks).
  router.get('/recipe/:id', async (req: Request, res: Response) => {
    let html: string;
    try {
      html = await getTemplate();
    } catch (error) {
      deps.logger.error(`share page: failed to load index.html: ${error}`);
      // 5xx lets CloudFront fail over to the static S3 copy of the SPA.
      return res.status(502).send('Bad gateway');
    }

    let body = html;
    let cacheControl = HTML_OK_CACHE;
    try {
      const recipe = await lookup(req.params.id);
      if (recipe) body = injectTags(html, buildRecipeTags(recipe, deps.urls));
    } catch (error) {
      cacheControl = SHORT_CACHE;
      deps.logger.warn(`share page: recipe lookup failed for ${req.params.id}: ${error}`);
    }

    return res
      .status(200)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(body);
  });

  // 1200x630 preview image: food photo + logo, or the default branded card.
  router.get('/api/og/recipe/:file', async (req: Request, res: Response) => {
    const id = req.params.file.replace(/\.jpe?g$/i, '');
    let image: Buffer = OG_DEFAULT_JPEG;
    let cacheControl = IMAGE_OK_CACHE;
    try {
      const recipe = await lookup(id);
      if (recipe && isUsableStorageName(recipe.storageName)) {
        const key = `${recipe.id}:${recipe.storageName}:${recipe.updatedAt ? new Date(recipe.updatedAt).getTime() : 0}`;
        const cached = imageCache.get(key);
        if (cached) {
          image = cached;
        } else {
          const photo = await deps.fetchPhoto(recipe.storageName);
          image = await renderRecipeOgImage(photo);
          if (image === OG_DEFAULT_JPEG) {
            // Photo missing or unrenderable: don't pin the fallback for a week.
            cacheControl = SHORT_CACHE;
          } else {
            if (imageCache.size >= IMAGE_CACHE_LIMIT) imageCache.delete(imageCache.keys().next().value as string);
            imageCache.set(key, image);
          }
        }
      }
    } catch (error) {
      cacheControl = SHORT_CACHE;
      deps.logger.warn(`og image: failed for ${id}: ${error}`);
    }

    return res
      .status(200)
      .set({
        'Content-Type': 'image/jpeg',
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
      })
      .send(image);
  });

  return router;
};

/**
 * The privacy gate: returns preview fields only for public recipes (or legacy
 * documents without visibility, which the app also treats as public).
 */
export const findPublicRecipe = async (id: string): Promise<PublicRecipe | null> => {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await RecipeModel.findOne(
    {
      _id: id,
      $or: [{ 'visibility.public': true }, { visibility: { $exists: false } }],
    },
    { name: 1, description: 1, portions: 1, cuisine: 1, timeToCook: 1, updatedAt: 1, 'image.storageName': 1 },
  ).lean();
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name,
    description: doc.description,
    portions: doc.portions,
    cuisine: doc.cuisine,
    timeToCook: doc.timeToCook,
    updatedAt: doc.updatedAt,
    storageName: doc.image?.storageName,
  };
};

/** Production wiring: Mongo for recipes, S3 for photos, the live site for HTML. */
export const createShareRoutes = (options: {
  urls: ShareUrls;
  logger: Logger;
  connect: () => Promise<unknown>;
  s3: S3Client;
  bucket: string;
}) =>
  shareRoutes({
    urls: options.urls,
    logger: options.logger,
    connect: options.connect,
    findPublicRecipe,
    fetchIndexHtml: async () => {
      const response = await fetch(`${options.urls.webBase.replace(/\/+$/, '')}/index.html`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!response.ok) throw new Error(`index.html returned ${response.status}`);
      return response.text();
    },
    fetchPhoto: async (storageName) => {
      try {
        const result = await options.s3.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: `images/${storageName}` }),
        );
        if (!result.Body || (result.ContentLength ?? 0) > MAX_PHOTO_BYTES) return null;
        return Buffer.from(await result.Body.transformToByteArray());
      } catch {
        return null;
      }
    },
  });

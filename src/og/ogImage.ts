import { OG_BADGE_PNG, OG_DEFAULT_JPEG } from './brandAssets';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Keep previews small: WhatsApp drops images over ~300 KB. */
const MAX_BYTES = 290 * 1024;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

type SharpModule = typeof import('sharp');
let sharpModule: Promise<SharpModule | null> | null = null;

/**
 * Load sharp lazily so a missing/incompatible native binary can never stop the
 * API from booting — previews just fall back to the default card.
 */
const loadSharp = (): Promise<SharpModule | null> => {
  sharpModule ??= import('sharp')
    .then((mod) => ((mod as unknown as { default?: SharpModule }).default ?? mod) as SharpModule)
    .catch((error) => {
      // Logged once per container: a packaging regression would otherwise
      // silently turn every preview into the default card.
      console.error('[og] sharp failed to load; using default preview card:', error);
      return null;
    });
  return sharpModule;
};

/**
 * Crop the food photo to the 1.91:1 social format (smart "attention" crop so
 * the dish stays in frame) and stamp the JustCooking logo bottom-left.
 * Returns the default branded card if the photo is missing or unreadable.
 */
export async function renderRecipeOgImage(photo: Buffer | null | undefined): Promise<Buffer> {
  if (!photo || photo.length === 0 || photo.length > MAX_SOURCE_BYTES) return OG_DEFAULT_JPEG;

  const sharp = await loadSharp();
  if (!sharp) return OG_DEFAULT_JPEG;

  try {
    const base = sharp(photo, { failOn: 'error', limitInputPixels: 60_000_000 })
      .rotate()
      .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: sharp.strategy.attention })
      .composite([{ input: OG_BADGE_PNG, left: 28, top: OG_HEIGHT - 104 - 26 }]);

    for (const quality of [82, 72, 62]) {
      const output = await base.clone().jpeg({ quality, mozjpeg: true, progressive: true }).toBuffer();
      if (output.length <= MAX_BYTES || quality === 62) return output;
    }
  } catch {
    // Corrupt or unsupported image — fall through to the default card.
  }
  return OG_DEFAULT_JPEG;
}

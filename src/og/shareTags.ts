/**
 * Builds social-preview (OpenGraph + Twitter) tags for a recipe and splices
 * them into the SPA's index.html between the `<!-- og:start -->` and
 * `<!-- og:end -->` markers. Pure functions so they are easy to unit test.
 */

export interface ShareRecipe {
  id: string;
  name: string;
  description?: string | null;
  portions?: string | null;
  cuisine?: string | null;
  timeToCook?: { Cook?: number | null; Prep?: number | null } | null;
  updatedAt?: Date | string | null;
}

export interface ShareUrls {
  /** Public web origin, e.g. https://www.justcook.ing */
  webBase: string;
  /** Public API origin, e.g. https://api.justcook.ing */
  apiBase: string;
}

const OG_BLOCK = /<!--\s*og:start[\s\S]*?<!--\s*og:end\s*-->/;

/** Escape text for safe use inside HTML text and double-quoted attributes. */
export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const collapse = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Truncate on a word boundary with an ellipsis. */
export const truncate = (value: string, max: number): string => {
  const text = collapse(value);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
};

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export const recipePageUrl = (urls: ShareUrls, id: string) => `${trimSlash(urls.webBase)}/recipe/${id}`;

export const recipeImageUrl = (urls: ShareUrls, recipe: ShareRecipe) => {
  const version = recipe.updatedAt ? new Date(recipe.updatedAt).getTime() : 0;
  // Served via the web origin's CDN (cached at the edge); the API distribution
  // itself has caching disabled.
  return `${trimSlash(urls.webBase)}/api/og/recipe/${recipe.id}.jpg${version ? `?v=${version}` : ''}`;
};

/** Short "Ready in 25 mins · Serves 4 · British" summary for the preview text. */
export const recipeSummary = (recipe: ShareRecipe): string => {
  const parts: string[] = [];
  const minutes = (recipe.timeToCook?.Prep ?? 0) + (recipe.timeToCook?.Cook ?? 0);
  if (minutes > 0) parts.push(`Ready in ${minutes} mins`);
  if (recipe.portions && Number(recipe.portions) > 0) parts.push(`Serves ${recipe.portions}`);
  if (recipe.cuisine?.trim()) parts.push(collapse(recipe.cuisine));
  return parts.join(' · ');
};

export const recipeDescription = (recipe: ShareRecipe): string => {
  const summary = recipeSummary(recipe);
  const base = recipe.description?.trim() ? truncate(recipe.description, 150) : `${collapse(recipe.name)} recipe on JustCooking.`;
  return summary ? `${base} ${summary}.` : base;
};

/** Build the full replacement tag block for a public recipe. */
export const buildRecipeTags = (recipe: ShareRecipe, urls: ShareUrls): string => {
  const name = truncate(recipe.name, 90);
  const title = escapeHtml(`${name} | JustCooking`);
  const ogTitle = escapeHtml(name);
  const description = escapeHtml(recipeDescription(recipe));
  const url = escapeHtml(recipePageUrl(urls, recipe.id));
  const image = escapeHtml(recipeImageUrl(urls, recipe));
  const alt = escapeHtml(`${name} – JustCooking recipe`);

  return [
    '<!-- og:start -->',
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="article" />',
    '<meta property="og:site_name" content="JustCooking" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${ogTitle}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:secure_url" content="${image}" />`,
    '<meta property="og:image:type" content="image/jpeg" />',
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${alt}" />`,
    '<meta property="og:locale" content="en_GB" />',
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${ogTitle}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${image}" />`,
    `<meta name="twitter:image:alt" content="${alt}" />`,
    '<!-- og:end -->',
  ].join('\n    ');
};

/** Replace the marker block; returns the original HTML if markers are absent. */
export const injectTags = (html: string, tags: string): string =>
  OG_BLOCK.test(html) ? html.replace(OG_BLOCK, () => tags) : html;

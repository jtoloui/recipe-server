import { FilterQuery } from 'mongoose';

import { Recipe } from '@/models/recipe';

/**
 * The single rule for who may read a recipe: public recipes, legacy recipes
 * with no visibility field (historically treated as public), and the
 * requesting user's own recipes. Use this for every recipe read so private
 * recipes can't leak through a less-guarded endpoint.
 */
export const visibleToUser = (userId?: string): FilterQuery<Recipe> => ({
  $or: [{ 'visibility.public': true }, { visibility: { $exists: false } }, ...(userId ? [{ creatorId: userId }] : [])],
});

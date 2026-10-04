import { Request, Response, Router } from 'express';
import mongoose from 'mongoose';

import { isAuthenticated } from '@/middleware/authenticated';
import FavouriteModel from '@/models/favourite';
import RecipeModel from '@/models/recipe';
import { ConfigType } from '@/types/config/config';
import { visibleToUser as visibleTo } from '@/utils/visibility';

const CARD_FIELDS = { name: 1, labels: 1, image: 1, ingredients: 1, timeToCook: 1 } as const;
/** Upper bound on a single favourites response (keeps queries and payloads bounded). */
const MAX_FAVOURITES = 500;
const isRecipeId = (id: string) => mongoose.isObjectIdOrHexString(id);

export const favouriteRoutes = (config: ConfigType) => {
  const router = Router();
  const logger = config.newLogger(config.logLevel, 'Favourites');

  const userIdOf = (req: Request) => req.session.user?.sub as string;

  const fail = (res: Response, error: unknown, action: string) => {
    logger.error(`Error ${action}: ${error}`);
    return res.status(500).json({ message: `Error ${action}` });
  };

  // Favourited recipe ids (cheap; drives the heart state across the app).
  router.get('/', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const favourites = await FavouriteModel.find({ userId: userIdOf(req) }, { recipeId: 1 })
        .sort({ createdAt: -1 })
        .limit(MAX_FAVOURITES)
        .lean();
      return res.status(200).json({ recipeIds: favourites.map((f) => String(f.recipeId)) });
    } catch (error) {
      return fail(res, error, 'retrieving favourites');
    }
  });

  // Favourited recipes as cards, newest favourite first. Recipes that were
  // deleted or made private by someone else are silently skipped.
  router.get('/recipes', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = userIdOf(req);
      const favourites = await FavouriteModel.find({ userId }, { recipeId: 1 })
        .sort({ createdAt: -1 })
        .limit(MAX_FAVOURITES)
        .lean();
      const ids = favourites.map((f) => f.recipeId);
      // Hydrated (not lean) so timeToCook virtuals such as totalTime are included.
      const recipes = await RecipeModel.find({ _id: { $in: ids }, ...visibleTo(userId) }, CARD_FIELDS);
      const byId = new Map(recipes.map((r) => [String(r._id), r]));
      const ordered = ids.map((id) => byId.get(String(id))).filter((r) => r !== undefined);
      return res.status(200).json({ recipes: ordered });
    } catch (error) {
      return fail(res, error, 'retrieving favourite recipes');
    }
  });

  // Idempotent add.
  router.put('/:recipeId', isAuthenticated, async (req: Request, res: Response) => {
    const { recipeId } = req.params;
    if (!isRecipeId(recipeId)) return res.status(400).json({ message: 'Invalid recipe ID' });
    try {
      const userId = userIdOf(req);
      const exists = await RecipeModel.exists({ _id: recipeId, ...visibleTo(userId) });
      if (!exists) return res.status(404).json({ message: 'Recipe not found' });
      await FavouriteModel.updateOne({ userId, recipeId }, { $setOnInsert: { userId, recipeId } }, { upsert: true });
      return res.status(200).json({ recipeId, favourited: true });
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        return res.status(200).json({ recipeId, favourited: true });
      }
      return fail(res, error, 'adding favourite');
    }
  });

  // Idempotent remove (works even if the recipe was since deleted).
  router.delete('/:recipeId', isAuthenticated, async (req: Request, res: Response) => {
    const { recipeId } = req.params;
    if (!isRecipeId(recipeId)) return res.status(400).json({ message: 'Invalid recipe ID' });
    try {
      await FavouriteModel.deleteOne({ userId: userIdOf(req), recipeId });
      return res.status(200).json({ recipeId, favourited: false });
    } catch (error) {
      return fail(res, error, 'removing favourite');
    }
  });

  return router;
};

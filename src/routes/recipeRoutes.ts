import { Router } from 'express';

import { RecipeController } from '../controllers/recipeController';
import { isAuthenticated } from '../middleware/authenticated';

const router = Router();
const recipeController = new RecipeController();

router.get('/recipes', isAuthenticated, recipeController.getAllRecipes);
router.get('/recipes/:id', isAuthenticated, recipeController.getRecipeById);
router.post('/recipes', isAuthenticated, recipeController.createRecipe);
router.get('/labels', isAuthenticated, recipeController.getRecipesLabels);
router.get(
  '/labels/:label',
  isAuthenticated,
  recipeController.getRecipesByLabel
);

export default router;

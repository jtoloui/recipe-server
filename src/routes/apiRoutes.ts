import { Router } from 'express';

import { ProfileController } from '../controllers/profileController';
import { RecipeController } from '../controllers/recipeController';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

const profileController = new ProfileController();
const recipeController = new RecipeController();

router.get('/profile', isAuthenticated, profileController.getProfile);

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

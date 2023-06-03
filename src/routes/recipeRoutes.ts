import { Router } from 'express';
import { RecipeController } from '../controllers/recipeController';
// import { isAuthenticated } from '../middleware/isAdmin';
import { requiresAuth } from 'express-openid-connect';

const router = Router();
const recipeController = new RecipeController();

router.get('/recipes', requiresAuth(), recipeController.getAllRecipes);
router.get('/recipes/:id', requiresAuth(), recipeController.getRecipeById);
router.post('/recipes', requiresAuth(), recipeController.createRecipe);
router.get('/labels', requiresAuth(), recipeController.getRecipesLabels);
router.get(
  '/labels/:label',
  requiresAuth(),
  recipeController.getRecipesByLabel
);

export default router;

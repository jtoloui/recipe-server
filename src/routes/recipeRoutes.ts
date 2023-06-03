import { Router } from 'express';
import { RecipeController } from '../controllers/recipeController';

const router = Router();
const recipeController = new RecipeController();

router.get('/recipes', recipeController.getAllRecipes);
router.get('/recipes/:id', recipeController.getRecipeById);
router.post('/recipes', recipeController.createRecipe);
router.get('/labels', recipeController.getRecipesLabels);
router.get('/labels/:label', recipeController.getRecipesByLabel);

export default router;

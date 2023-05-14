import { Router } from "express";
import { RecipeController } from "../controllers/recipeController";

const router = Router();
const recipeController = new RecipeController();

router.get("/", recipeController.getAllRecipes);
router.get("/:id", recipeController.getRecipeById);
router.post("/", recipeController.createRecipe);

export default router;

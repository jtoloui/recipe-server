import RecipeModel, { Recipe, RecipeAttributes } from "../models/recipe";
import logger from "../logger/winston";
import { ValidateError } from "../../types/ValidationError";

class RecipeController {
	private logger: ReturnType<typeof logger>;

	constructor() {
		const logLevel = process.env.LOG_LEVEL || "info";
		this.logger = logger(logLevel, "RecipeController");
	}

	// Build a new recipe instance without saving
	async buildModel(recipeAttrs: RecipeAttributes): Promise<Recipe> {
		this.logger.info("Building a new recipe instance");
		const recipe = RecipeModel.build(recipeAttrs);
		return recipe;
	}

	// Build and save a new recipe instance
	async buildAndSave(recipeAttrs: RecipeAttributes): Promise<Recipe> {
		this.logger.info("Building and saving a new recipe instance");
		const recipe = RecipeModel.build(recipeAttrs);
		await recipe.save();
		return recipe;
	}

	// Validate a recipe instance
	async validateModel(recipe: RecipeAttributes): Promise<boolean> {
		try {
			this.logger.info("Validating a recipe instance");
			await RecipeModel.validate(recipe);
			return true;
		} catch (error) {
			const err = error as ValidateError;
			this.logger.error(err);
			throw err.message;
		}
	}

	// Query recipes with optional filters
	async queryRecipes(
		filters: Partial<RecipeAttributes> = {}
	): Promise<Recipe[]> {
		this.logger.info("Querying recipes with filters:", filters);
		const recipes = await RecipeModel.find(filters);
		return recipes;
	}
}

export default new RecipeController();

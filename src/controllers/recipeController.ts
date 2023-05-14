import { Request, Response } from "express";

import RecipeModel, { RecipeAttributes } from "../models/recipe";
import logger from "../logger/winston";

export class RecipeController {
	private logger: ReturnType<typeof logger>;

	constructor() {
		const logLevel = process.env.LOG_LEVEL || "info";
		this.logger = logger(logLevel, "RecipeController");
	}

	getAllRecipes = async (req: Request, res: Response) => {
		try {
			const recipes = await RecipeModel.find({});
			return res.status(200).json(recipes);
		} catch (error) {
			this.logger.error(`Request ID: ${req.id} - ${error}`);
			return res.status(500).json({ message: "Error retrieving recipes" });
		}
	};

	getRecipeById = async (req: Request, res: Response) => {
		try {
			const recipe = await RecipeModel.findById(req.params.id);
			if (recipe) {
				return res.status(200).json(recipe);
			} else {
				return res.status(404).json({ message: "Recipe not found" });
			}
		} catch (error) {
			this.logger.error(`Request ID: ${req.id} - ${error}`);
			return res.status(500).json({ message: "Error retrieving recipe" });
		}
	};

	createRecipe = async (req: Request, res: Response) => {
		const newRecipe = RecipeModel.build(req.body as RecipeAttributes);
		try {
			await newRecipe.save();
			return res.status(201).json(newRecipe);
		} catch (error) {
			this.logger.error(`Request ID: ${req.id} - ${error}`);
			return res.status(500).json({ message: "Error creating recipe" });
		}
	};
}

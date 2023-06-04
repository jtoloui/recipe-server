import { Request, Response } from 'express';

import RecipeModel, { RecipeAttributes } from '../models/recipe';
import logger from '../logger/winston';

type getRecipesByLabelParams = {
  label: string;
};
export class RecipeController {
  private logger: ReturnType<typeof logger>;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'info';
    this.logger = logger(logLevel, 'RecipeController');
  }

  getAllRecipes = async (req: Request, res: Response) => {
    try {
      const recipes = await RecipeModel.find({});
      return res.status(200).json(recipes);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipes' });
    }
  };

  getRecipeById = async (req: Request, res: Response) => {
    try {
      const recipe = await RecipeModel.findById(req.params.id);
      if (recipe) {
        return res.status(200).json(recipe);
      } else {
        return res.status(404).json({ message: 'Recipe not found' });
      }
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipe' });
    }
  };

  createRecipe = async (req: Request, res: Response) => {
    const newRecipe = RecipeModel.build(req.body as RecipeAttributes);
    try {
      await newRecipe.validate();
      await newRecipe.save();
      return res.status(201).json(newRecipe);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error creating recipe' });
    }
  };

  getRecipesLabels = async (req: Request, res: Response) => {
    try {
      const labels = await RecipeModel.aggregate([
        {
          $facet: {
            totalRecipes: [
              {
                $count: 'total',
              },
            ],
            labelCounts: [
              {
                $unwind: '$labels',
              },
              {
                $group: {
                  _id: '$labels',
                  count: { $sum: 1 },
                },
              },
              {
                $project: {
                  _id: 0,
                  label: '$_id',
                  count: 1,
                },
              },
            ],
          },
        },
        {
          $project: {
            totalRecipes: { $arrayElemAt: ['$totalRecipes.total', 0] },
            labelCounts: 1,
          },
        },
      ]);

      return res.status(200).json({ ...labels[0] });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving labels' });
    }
  };

  getRecipesByLabel = async (
    req: Request<getRecipesByLabelParams>,
    res: Response
  ) => {
    try {
      const { label } = req.params;

      const findReturnItems: {
        [K in keyof Partial<RecipeAttributes>]: number;
      } = {
        name: 1,
        labels: 1,
        imageSrc: 1,
        ingredients: 1,
        timeToCook: 1,
      };
      this.logger.info(`Request ID: ${req.id} - ${label}`);

      if (label.toLocaleLowerCase() === 'all') {
        const recipes = await RecipeModel.find({}, findReturnItems);
        const recipesWithTotalTime = recipes.map((recipe) => {
          const totalHours = recipe.timeToCook.totalHours;
          const totalMinutes = recipe.timeToCook.totalMinutes;
          const totalTime =
            totalHours >= 1 ? `${totalHours} hrs` : `${totalMinutes} mins`;
          return { ...recipe.toObject(), totalHours, totalMinutes, totalTime };
        });
        return res.status(200).json(recipesWithTotalTime);
      }
      const recipes = await RecipeModel.find(
        { labels: label },
        findReturnItems
      );
      const recipesWithTotalTime = recipes.map((recipe) => {
        const totalHours = recipe.timeToCook.totalHours;
        const totalMinutes = recipe.timeToCook.totalMinutes;
        const totalTime =
          totalHours >= 1 ? `${totalHours} hrs` : `${totalMinutes} mins`;
        return { ...recipe.toObject(), totalHours, totalMinutes, totalTime };
      });
      return res.status(200).json(recipesWithTotalTime);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipes' });
    }
  };
}

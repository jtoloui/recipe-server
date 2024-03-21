import { Request, Response } from 'express';
import { z } from 'zod';

import RecipeModel, { RecipeAttributes } from '../models/recipe';
import { getMeasurementsType, groupRecipesByLabel } from '../queries';
import { convertRecipeZodToMongo, createRecipeSchema } from '../schemas';
import { controllerConfig } from '../config/config';
import { Logger } from 'winston';

type getRecipesByLabelParams = {
  label: string;
};

interface Recipe {
  getAllRecipes: (req: Request, res: Response) => Promise<Response>;
  getRecipeById: (req: Request, res: Response) => Promise<Response>;
  createRecipe: (req: Request, res: Response) => Promise<Response>;
  getRecipesLabels: (req: Request, res: Response) => Promise<Response>;
  getRecipesByLabel: (
    req: Request<getRecipesByLabelParams>,
    res: Response,
  ) => Promise<Response>;
  measurementsType: (req: Request, res: Response) => Promise<Response>;
  getPopularLabels: (req: Request, res: Response) => Promise<Response>;
}
export class RecipeController implements Recipe {
  private logger: Logger;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
  }

  getAllRecipes = async (req: Request, res: Response) => {
    try {
      const recipes = await RecipeModel.find({});
      this.logger.info(`Request ID: ${req.id} - ${recipes}`);
      return res.status(200).json(recipes);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipes' });
    }
  };

  getRecipeById = async (req: Request, res: Response) => {
    try {
      const findReturnItems: {
        [K in keyof Partial<RecipeAttributes>]: number;
      } = {
        name: 1,
        labels: 1,
        imageSrc: 1,
        ingredients: 1,
        timeToCook: 1,
        steps: 1,
        vegan: 1,
        vegetarian: 1,
        creatorId: 1,
        recipeAuthor: 1,
        difficulty: 1,
        portions: 1,
        description: 1,
        nutrition: 1,
        cuisine: 1,
      };
      const recipe = await RecipeModel.findById(req.params.id, findReturnItems);
      if (recipe) {
        const isAuthor = recipe.creatorId === req.session?.user?.sub;
        return res.status(200).json({ ...recipe.toObject(), isAuthor });
      } else {
        return res.status(404).json({ message: 'Recipe not found' });
      }
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipe' });
    }
  };

  createRecipe = async (req: Request, res: Response) => {
    try {
      const validatedReqData = await createRecipeSchema.parseAsync(req.body);
      const newRecipeData = convertRecipeZodToMongo(validatedReqData);
      const { labels } = newRecipeData;
      const capitalizedLabels = labels.map(
        (label) => label.charAt(0).toUpperCase() + label.slice(1),
      );

      const newRecipe = await RecipeModel.create({
        ...newRecipeData,
        creatorId: req.session?.user?.sub,
        recipeAuthor: req.session?.user?.name,
        labels: capitalizedLabels,
      });
      await newRecipe.validate();
      await newRecipe.save();

      return res.status(201).json(newRecipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error(`Request ID: ${req.id} - ${error.errors}`);
        return res.status(400).json({ message: 'Invalid request data', error });
      }
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error creating recipe' });
    }
  };

  getRecipesLabels = async (req: Request, res: Response) => {
    try {
      const labels = await RecipeModel.aggregate(groupRecipesByLabel);

      return res.status(200).json({ ...labels[0] });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving labels' });
    }
  };

  getRecipesByLabel = async (
    req: Request<getRecipesByLabelParams>,
    res: Response,
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
      this.logger.info(
        `UserId: ${req.session.user?.sub} - Request ID: ${req.id} - ${label}`,
      );

      if (label.toLocaleLowerCase() === 'all') {
        const recipes = await RecipeModel.find({}, findReturnItems);
        const recipesWithTotalTime = recipes.map((recipe) => {
          const totalHours = recipe.timeToCook.totalHours || 0;
          const totalMinutes = recipe.timeToCook.totalMinutes || 0;
          const totalTime =
            totalHours >= 1
              ? `${parseFloat(totalHours.toFixed(2))} hrs`
              : `${parseFloat(totalMinutes.toFixed(2))} mins`;
          return { ...recipe.toObject(), totalHours, totalMinutes, totalTime };
        });
        return res.status(200).json(recipesWithTotalTime);
      }
      const recipes = await RecipeModel.find(
        { labels: { $regex: new RegExp(`^${label}$`, 'i') } },
        findReturnItems,
      );
      const recipesWithTotalTime = recipes.map((recipe) => {
        const totalHours = recipe.timeToCook.totalHours || 0;
        const totalMinutes = recipe.timeToCook.totalMinutes || 0;
        const totalTime =
          totalHours >= 1
            ? `${parseFloat(totalHours.toFixed(2))} hrs`
            : `${parseFloat(totalMinutes.toFixed(2))} mins`;
        return { ...recipe.toObject(), totalHours, totalMinutes, totalTime };
      });
      return res.status(200).json(recipesWithTotalTime);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving recipes' });
    }
  };

  measurementsType = async (req: Request, res: Response) => {
    try {
      const measurementsAgg = await RecipeModel.aggregate(getMeasurementsType);
      return res
        .status(200)
        .json({ measurements: measurementsAgg[0].measurements });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving measurements' });
    }
  };

  getPopularLabels = async (req: Request, res: Response) => {
    try {
      const popularLabels = await RecipeModel.aggregate([
        { $unwind: '$labels' },
        {
          $group: {
            _id: { $toLower: '$labels' },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $addFields: {
            capitalizedLabel: {
              $concat: [
                {
                  $toUpper: {
                    $substrCP: ['$_id', 0, 1],
                  },
                },
                {
                  $substrCP: [
                    '$_id',
                    1,
                    {
                      $subtract: [{ $strLenCP: '$_id' }, 1],
                    },
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            labels: { $push: '$capitalizedLabel' },
          },
        },
      ]);
      return res.status(200).json({ ...popularLabels[0] });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving labels' });
    }
  };
}

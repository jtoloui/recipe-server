import { Request, Response } from 'express';

import RecipeModel, { RecipeAttributes } from '../models/recipe';
import { groupRecipesByLabel } from '../queries';
import { controllerConfig } from '../config/config';
import { Logger } from 'winston';

type getRecipesByLabelParams = {
  label: string;
};

interface Label {
  getLabels: (req: Request, res: Response) => Promise<Response>;
  getByLabel: (
    req: Request<getRecipesByLabelParams>,
    res: Response,
  ) => Promise<Response>;
  getPopularLabels: (req: Request, res: Response) => Promise<Response>;
}

export class LabelController implements Label {
  private logger: Logger;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
  }

  getLabels = async (req: Request, res: Response) => {
    try {
      const labels = await RecipeModel.aggregate(groupRecipesByLabel);

      return res.status(200).json({ ...labels[0] });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - ${error}`);
      return res.status(500).json({ message: 'Error retrieving labels' });
    }
  };

  getByLabel = async (req: Request<getRecipesByLabelParams>, res: Response) => {
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
      this.logger.debug(
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

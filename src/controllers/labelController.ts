import { Request, Response } from 'express';
import { Logger } from 'winston';

import RecipeModel, { RecipeAttributes } from '../models/recipe';
import { groupRecipesByLabel } from '../queries';
import { controllerConfig } from '../types/controller/controller';
import ResponseHandler from '../utils/responseHandler';

type getRecipesByLabelParams = {
  label: string;
};

interface Label {
  getLabels: (req: Request, res: Response) => Promise<Response>;
  getByLabel: (req: Request<getRecipesByLabelParams>, res: Response) => Promise<Response>;
  getPopularLabels: (req: Request, res: Response) => Promise<Response>;
}

export class LabelController implements Label {
  private logger: Logger;
  private response: ResponseHandler;

  constructor(config: controllerConfig) {
    this.logger = config.logger;
    this.response = new ResponseHandler({ logger: this.logger });
  }

  getLabels = async (req: Request, res: Response) => {
    try {
      const labels = await RecipeModel.aggregate(groupRecipesByLabel);
      const labelsResponse = { ...labels[0] };

      return this.response.sendSuccess(res, labelsResponse);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, 'Error retrieving labels');
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
        image: 1,
        ingredients: 1,
        timeToCook: 1,
      };
      this.logger.debug(
        `UserId: ${req.session.user?.sub} - Request ID: ${req.id} - Session ID: ${req.sessionID} - ${label}`,
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

        return this.response.sendSuccess(res, recipesWithTotalTime);
      }
      const recipes = await RecipeModel.find({ labels: { $regex: new RegExp(`^${label}$`, 'i') } }, findReturnItems);
      const recipesWithTotalTime = recipes.map((recipe) => {
        const totalHours = recipe.timeToCook.totalHours || 0;
        const totalMinutes = recipe.timeToCook.totalMinutes || 0;
        const totalTime =
          totalHours >= 1 ? `${parseFloat(totalHours.toFixed(2))} hrs` : `${parseFloat(totalMinutes.toFixed(2))} mins`;
        return { ...recipe.toObject(), totalHours, totalMinutes, totalTime };
      });

      return this.response.sendSuccess(res, recipesWithTotalTime);
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);
      return this.response.sendError(res, 500, 'Error retrieving recipes');
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

      return this.response.sendSuccess(res, { ...popularLabels[0] });
    } catch (error) {
      this.logger.error(`Request ID: ${req.id} - Session ID: ${req.sessionID} - ${error}`);

      return this.response.sendError(res, 500, 'Error retrieving popular labels');
    }
  };
}

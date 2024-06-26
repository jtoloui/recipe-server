import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Request } from 'express';
import mongoose, { Document, FilterQuery, MongooseError } from 'mongoose';
import { Logger } from 'winston';
import { z } from 'zod';

import { s3Client } from '@/auth/awsS3';
import { RecipeAttributes, Recipe as RecipeType } from '@/models/recipe';
import {
  CreateRecipeFormData,
  CreateRecipeFormDataRequest,
  convertRecipeZodToMongo,
  createRecipeSchema,
} from '@/schemas/index';
import { RecipeStore } from '@/store/recipeStore';
import { buildOrQuery } from '@/store/utils/queryBuilder';
import { User } from '@/types/common/user';
import { configWithAWS, configWithLogger } from '@/types/controller/controller';
import { ServiceError } from '@/utils/errors';

import {
  RecipeByIdErrors,
  RecipeCreateErrors,
  RecipeCreateValidationErrors,
  RecipeIdInvalidFormat,
  RecipeNotFound,
  RecipeServiceErrors,
  RecipeUnauthorized,
  RecipeUpdateErrors,
} from './errors';
import { GetAllRecipesServiceResponse } from './types';

interface Recipe {
  getAllRecipes: (
    search?: string,
    label?: string,
  ) => Promise<GetAllRecipesServiceResponse<'name' | 'labels' | 'image' | 'ingredients' | 'timeToCook'>>;
  getRecipesByUser: (
    user: User,
    search?: string,
    label?: string,
  ) => Promise<GetAllRecipesServiceResponse<'name' | 'labels' | 'image' | 'ingredients' | 'timeToCook'>>;
  getRecipeById: (id: string) => Promise<RecipeType | null>;
  createRecipe: (payload: Request<any, any, CreateRecipeFormDataRequest>, user: User) => Promise<RecipeType>;
  updateRecipe: (payload: Request<any, any, CreateRecipeFormDataRequest>, user: User) => Promise<RecipeType>;
}

type AwsConfig = {
  awsRegion: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsS3BucketName: string;
};
export class RecipeService implements Recipe {
  private store: RecipeStore;
  private logger: Logger;
  private tx: typeof mongoose;
  private awsConfig: AwsConfig;
  private s3Client: S3Client;

  constructor(config: configWithAWS) {
    this.tx = mongoose;
    this.awsConfig = {
      awsRegion: config.awsRegion,
      awsAccessKeyId: config.awsAccessKeyId,
      awsSecretAccessKey: config.awsSecretAccessKey,
      awsS3BucketName: config.awsS3BucketName,
    };
    this.store = new RecipeStore({ logger: config.newLogger(config.logLevel, 'RecipeStore') });
    this.logger = config.newLogger(config.logLevel, 'RecipeService');
    this.s3Client = s3Client({
      region: this.awsConfig.awsRegion,
      accessKeyId: this.awsConfig.awsAccessKeyId,
      secretAccessKey: this.awsConfig.awsSecretAccessKey,
    });
  }

  async getAllRecipes(
    search?: string,
    label?: string,
  ): Promise<GetAllRecipesServiceResponse<'name' | 'labels' | 'image' | 'ingredients' | 'timeToCook'>> {
    const session = await this.tx.startSession();
    try {
      session.startTransaction();
      let queryConditions: FilterQuery<RecipeType> = {
        $or: [
          { 'visibility.public': true },
          { visibility: { $exists: false } }, // Consider documents without the visibility field as public
        ],
      };
      if (search) {
        queryConditions = {
          ...queryConditions,
          $and: [{ $or: buildOrQuery<RecipeAttributes>(search, ['name', 'recipeAuthor', 'ingredients.item'], 'i') }],
        };
      }

      if (label && label.toLocaleLowerCase() !== 'all') {
        queryConditions.labels = { $regex: new RegExp(`^${label}$`, 'i') };
      }

      const matchingLabelsCondition = {
        ...queryConditions,
      };
      delete matchingLabelsCondition.labels;

      function assertFields<T extends keyof RecipeAttributes>(fields: T[]): T[] {
        return fields;
      }

      const fields = assertFields(['name', 'labels', 'image', 'ingredients', 'timeToCook']);
      const recipeQueryResults = await this.store.getAllRecipes(queryConditions, fields);
      const labelsFromQueryResults = await this.store.getLabelFromQuery(matchingLabelsCondition, !!search);

      const allLabels = await this.store.getLabelFromQuery(queryConditions, false);

      session.commitTransaction();

      const response: GetAllRecipesServiceResponse<'name' | 'labels' | 'image' | 'ingredients' | 'timeToCook'> = {
        recipes: recipeQueryResults,
        labels: labelsFromQueryResults[0],
        allLabels: allLabels[0],
      };
      return response;
    } catch (error) {
      this.logger.error(`Error retrieving recipes: ${error}`);
      session.abortTransaction();
      throw new ServiceError(RecipeServiceErrors, {
        status: 500,
        message: 'Error retrieving recipes',
      });
    } finally {
      await session.endSession();
    }
  }

  async getRecipesByUser(
    user: User,
    search?: string,
    label?: string,
  ): Promise<GetAllRecipesServiceResponse<'name' | 'labels' | 'image' | 'ingredients' | 'timeToCook'>> {
    const session = await this.tx.startSession();
    try {
      session.startTransaction();
      const defaultConditions: FilterQuery<RecipeType> = { creatorId: user.sub };
      let queryConditions: FilterQuery<RecipeType> = defaultConditions;
      if (search) {
        queryConditions = {
          $and: [
            queryConditions,
            { $or: buildOrQuery<RecipeAttributes>(search, ['name', 'recipeAuthor', 'ingredients.item'], 'i') },
          ],
        };
      }

      if (label && label.toLocaleLowerCase() !== 'all') {
        queryConditions.labels = { $regex: new RegExp(`^${label}$`, 'i') };
      }

      const matchingLabelsCondition = {
        ...queryConditions,
      };
      delete matchingLabelsCondition.labels;
      const matchLabelsForUserAllRecipes = {
        ...defaultConditions,
      };
      delete matchLabelsForUserAllRecipes.labels;

      function assertFields<T extends keyof RecipeAttributes>(fields: T[]): T[] {
        return fields;
      }

      const fields = assertFields(['name', 'labels', 'image', 'ingredients', 'timeToCook']);

      const recipeQueryResults = await this.store.getAllRecipes(queryConditions, fields);
      // Get all labels for the user with the search query regardless if search is passed in
      const labelsFromQueryResults = await this.store.getLabelFromQuery(matchingLabelsCondition, true);

      // Get all labels for the user
      const allLabels = await this.store.getLabelFromQuery(matchLabelsForUserAllRecipes, true);

      session.commitTransaction();

      const response: GetAllRecipesServiceResponse<'name' | 'labels' | 'image' | 'ingredients' | 'timeToCook'> = {
        recipes: recipeQueryResults,
        labels: labelsFromQueryResults[0],
        allLabels: allLabels[0],
      };
      return response;
    } catch (error) {
      this.logger.error(`Error retrieving recipes: ${error}`);
      session.abortTransaction();
      throw new ServiceError(RecipeServiceErrors, {
        status: 500,
        message: 'Error retrieving recipes',
      });
    } finally {
      await session.endSession();
    }
  }

  async getRecipeById(id: string): Promise<RecipeType | null> {
    try {
      const findReturnItems: {
        [K in keyof Partial<RecipeAttributes>]: number;
      } = {
        name: 1,
        labels: 1,
        image: 1,
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
        visibility: 1,
      };
      return await this.store.getRecipeById(id, findReturnItems);
    } catch (error) {
      if (error instanceof MongooseError && error.name === 'CastError') {
        this.logger.debug(`Invalid recipe ID: ${id}`);
        throw new ServiceError(RecipeIdInvalidFormat, {
          status: 400,
          message: 'Invalid recipe ID',
        });
      }
      this.logger.error(`Error retrieving recipe: ${error}`);
      throw new ServiceError(RecipeByIdErrors, {
        status: 500,
        message: 'Error retrieving recipe',
      });
    }
  }

  async createRecipe(payload: Request<any, any, CreateRecipeFormDataRequest>, user: User): Promise<RecipeType> {
    const session = await this.tx.startSession();
    try {
      session.startTransaction();
      const payloadData: CreateRecipeFormData = JSON.parse(payload.body.jsonData);
      const imageSrc = payload.file;

      if (!imageSrc) {
        throw new Error('Image not found');
      }

      const validatedReqData = await createRecipeSchema.parseAsync(payloadData);
      const newRecipeData = convertRecipeZodToMongo(validatedReqData, imageSrc);

      const { labels } = newRecipeData;
      const capitalizedLabels = labels.map((label) => label.charAt(0).toUpperCase() + label.slice(1));

      const newRecipe = await this.store.createRecipe(
        {
          ...newRecipeData,
          labels: capitalizedLabels,
          creatorId: user.sub,
          recipeAuthor: user.name,
        },
        session,
      );

      const putImageCommand = new PutObjectCommand({
        Bucket: this.awsConfig.awsS3BucketName,
        Key: `images/${newRecipe.id}-${imageSrc.originalname.toLocaleLowerCase().replace(/ /g, '_')}`,
        Body: imageSrc.buffer,
        ContentType: imageSrc.mimetype,
        Metadata: {
          originalname: imageSrc.originalname,
          userId: user.sub,
          recipeId: newRecipe.id,
        },
      });

      return await this.s3Client
        .send(putImageCommand)
        .then(() => {
          return session.commitTransaction().then(() => {
            return newRecipe;
          });
        })
        .catch((error) => {
          this.logger.debug(`Error uploading image: ${error}`);
          throw new Error('Error uploading image');
        });
    } catch (error) {
      await session.abortTransaction();

      if (error instanceof z.ZodError) {
        this.logger.debug(`Invalid request payload: ${error.errors}`);
        throw new ServiceError(RecipeCreateValidationErrors, {
          status: 400,
          message: 'Payload did not match schema',
        });
      }

      const errorMessage = error instanceof Error ? error.message : 'Error creating recipe';

      this.logger.debug(`Error creating recipe: ${errorMessage}`);
      throw new ServiceError(RecipeCreateErrors, {
        status: 500,
        message: errorMessage,
      });
    } finally {
      await session.endSession();
    }
  }

  async updateRecipe(
    payload: Request<{ id: string }, any, CreateRecipeFormDataRequest>,
    user: User,
  ): Promise<RecipeType> {
    const session = await this.tx.startSession();

    try {
      session.startTransaction();
      const payloadData: CreateRecipeFormData = JSON.parse(payload.body.jsonData);
      const imageSrc = payload.file;

      if (!imageSrc) {
        throw new Error('Image not found');
      }

      const validatedReqData = await createRecipeSchema.parseAsync(payloadData);
      const updatedRecipeData = convertRecipeZodToMongo(validatedReqData, imageSrc);

      const { labels } = updatedRecipeData;
      const capitalizedLabels = labels.map((label) => label.charAt(0).toUpperCase() + label.slice(1));

      const currentRecipe = await this.store.getRecipeById(payload.params.id, {}, session);

      if (!currentRecipe) {
        throw new ServiceError(RecipeNotFound, {
          status: 404,
          message: 'Recipe not found',
        });
      }

      if (currentRecipe.creatorId !== user.sub) {
        this.logger.error(`Unauthorized to update recipe -  User: ${user.sub} - Recipe: ${payload.params.id}`);
        throw new ServiceError(RecipeUnauthorized, {
          status: 403,
          message: 'Unauthorized to update recipe',
        });
      }

      const updatedRecipe = await this.store.updateRecipe(
        currentRecipe,
        {
          ...updatedRecipeData,
          labels: capitalizedLabels,
          creatorId: user.sub,
          recipeAuthor: user.name,
        },
        session,
      );

      const putImageCommand = new PutObjectCommand({
        Bucket: this.awsConfig.awsS3BucketName,
        Key: `images/${updatedRecipe.id}-${imageSrc.originalname.toLocaleLowerCase().replace(/ /g, '_')}`,
        Body: imageSrc.buffer,
        ContentType: imageSrc.mimetype,
        Metadata: {
          originalname: imageSrc.originalname,
          userId: user.sub,
          recipeId: updatedRecipe.id,
        },
      });

      return await this.s3Client
        .send(putImageCommand)
        .then(() => {
          return session.commitTransaction().then(() => {
            return updatedRecipe;
          });
        })
        .catch((error) => {
          console.log(error);

          this.logger.debug(`Error uploading image: ${error}`);
          throw new Error('Error uploading image');
        });
    } catch (error) {
      console.log(error);

      await session.abortTransaction();

      if (error instanceof z.ZodError) {
        this.logger.debug(`Invalid request payload: ${error.errors}`);
        throw new ServiceError(RecipeCreateValidationErrors, {
          status: 400,
          message: 'Payload did not match schema',
        });
      }

      if (error instanceof ServiceError) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Error updating recipe';

      this.logger.debug(`Error updating recipe: ${errorMessage}`);
      throw new ServiceError(RecipeUpdateErrors, {
        status: 500,
        message: errorMessage,
      });
    } finally {
      await session.endSession();
    }
  }
}

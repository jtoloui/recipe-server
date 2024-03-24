import { Request } from 'express';
import mongoose, { MongooseError } from 'mongoose';
import { Logger } from 'winston';
import { z } from 'zod';

import { RecipeAttributes, Recipe as RecipeType } from '@/models/recipe';
import {
  CreateRecipeFormData,
  CreateRecipeFormDataRequest,
  convertRecipeZodToMongo,
  createRecipeSchema,
} from '@/schemas/index';
import { RecipeStore } from '@/store/recipeStore';
import { User } from '@/types/common/user';
import { configWithAWS, configWithLogger } from '@/types/controller/controller';
import { ServiceError } from '@/utils/errors';

import {
  RecipeByIdErrors,
  RecipeCreateErrors,
  RecipeCreateValidationErrors,
  RecipeIdInvalidFormat,
  RecipeServiceErrors,
} from './errors';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { s3Client } from '@/auth/awsS3';

interface Recipe {
  getAllRecipes: () => Promise<RecipeType[]>;
  getRecipeById: (id: string) => Promise<RecipeType | null>;
  createRecipe: (payload: Request<any, any, CreateRecipeFormDataRequest>, user: User) => Promise<RecipeType>;
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

  async getAllRecipes(): Promise<RecipeType[]> {
    try {
      return await this.store.getAllRecipes();
    } catch (error) {
      this.logger.error(`Error retrieving recipes: ${error}`);
      throw new ServiceError(RecipeServiceErrors, {
        status: 500,
        message: 'Error retrieving recipes',
      });
    }
  }

  async getRecipeById(id: string): Promise<RecipeType | null> {
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
      const newRecipeData = convertRecipeZodToMongo(validatedReqData);

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

      console.log(imageSrc.mimetype);

      const putImageCommand = new PutObjectCommand({
        Bucket: this.awsConfig.awsS3BucketName,
        Key: newRecipe.id,
        Body: imageSrc.buffer,
        ContentType: imageSrc.mimetype,
        Metadata: {
          originalname: imageSrc.originalname,
          userId: user.sub,
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
      console.log('here');

      await session.abortTransaction();

      console.log(error);

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
}

import { NextFunction, Request, Response, Router } from 'express';
import multer from 'multer';

import { RecipeController } from '@/controllers/RecipeController/recipeController';
import { isAuthenticated } from '@/middleware/authenticated';
import { CreateRecipeFormDataRequest } from '@/schemas';
import { ConfigType } from '@/types/config/config';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // limit file size to 5MB
  },
});
const uploadFile = upload.single('imageSrc');

export const recipeRoutes = (config: ConfigType) => {
  const router = Router();
  const recipeController = new RecipeController({
    logger: config.newLogger(config.logLevel, 'RecipeController'),
    newLogger: config.newLogger,
    logLevel: config.logLevel,
    awsRegion: config.awsRegion,
    awsS3BucketName: config.awsS3BucketName,
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
  });

  router.get('/', isAuthenticated, recipeController.getAllRecipes);
  router.get('/:id', isAuthenticated, recipeController.getRecipeById);
  router.post('/', isAuthenticated, (req: Request<any, any, CreateRecipeFormDataRequest>, res: Response) => {
    uploadFile(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: 'Invalid file key name' });
      }
      recipeController.createRecipe(req, res);
    });
  });
  // router.post('/', isAuthenticated, upload.single('imageSrc'), recipeController.createRecipe);

  return router;
};

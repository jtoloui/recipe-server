import mongoose, { Schema, Types } from 'mongoose';

export interface FavouriteAttributes {
  /** Cognito `sub` of the user who saved the recipe. */
  userId: string;
  recipeId: Types.ObjectId;
  createdAt: Date;
}

const favouriteSchema = new Schema<FavouriteAttributes>(
  {
    userId: { type: String, required: true },
    recipeId: { type: Schema.Types.ObjectId, required: true, ref: 'Recipe' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

// One favourite per user per recipe; also serves "my favourites, newest first".
favouriteSchema.index({ userId: 1, recipeId: 1 }, { unique: true });
favouriteSchema.index({ userId: 1, createdAt: -1 });

const FavouriteModel = mongoose.model<FavouriteAttributes>('Favourite', favouriteSchema);

export default FavouriteModel;

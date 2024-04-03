import mongoose, { Document, Schema } from 'mongoose';

interface TimeToCook {
  Cook: number;
  Prep: number;
  totalMinutes?: number; // Virtual field for total time in minutes;
  totalHours?: number; // Virtual field for total time in hours;
  totalDays?: number; // Virtual field for total time in days;
  totalTime?: string; // Virtual field for total time in hours or minutes;
}

interface Nutrition {
  kcal?: number | null;
  sugars?: number | null;
  salt?: number | null;
  carbs?: number | null;
  protein?: number | null;
  fat?: number | null;
  saturates?: number | null;
  fibre?: number | null;
}

interface Ingredient {
  item: string;
  measurement: string;
  quantity: number;
}

interface Image {
  src: string;
  type: string;
  originalName: string;
  storageName: string;
}

export interface Recipe extends Document, RecipeAttributes {}

export interface RecipeAttributes {
  name: string;
  image: Image;
  recipeAuthor: string;
  timeToCook: TimeToCook;
  difficulty: string | null;
  labels: string[];
  portions: string;
  description: string;
  nutrition: Nutrition | undefined;
  ingredients: Ingredient[];
  steps: string[];
  vegan: boolean;
  vegetarian: boolean;
  cuisine: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateRecipeModelData = Omit<
  RecipeAttributes,
  | 'creatorId'
  | 'recipeAuthor'
  | 'timeToCook.totalMinutes'
  | 'timeToCook.totalHours'
  | 'timeToCook.totalDays'
  | 'createdAt'
  | 'updatedAt'
>;

export type CreateRecipeData = Omit<
  RecipeAttributes,
  'timeToCook.totalMinutes' | 'timeToCook.totalHours' | 'timeToCook.totalDays' | 'createdAt' | 'updatedAt'
>;

const timeToCookSchema = new Schema<TimeToCook>(
  {
    Cook: Number,
    Prep: Number,
  },
  {
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
    toObject: { virtuals: true },
  },
);

timeToCookSchema.virtual('totalMinutes').get(function (this: TimeToCook) {
  return this.Cook + this.Prep;
});

timeToCookSchema.virtual('totalHours').get(function (this: TimeToCook) {
  return (this.Cook + this.Prep) / 60;
});

timeToCookSchema.virtual('totalDays').get(function (this: TimeToCook) {
  return (this.Cook + this.Prep) / (60 * 24);
});

timeToCookSchema.virtual('totalTime').get(function (this: TimeToCook) {
  const totalHours = this.totalHours || 0;
  const totalMinutes = this.totalMinutes || 0;
  const totalTime =
    totalHours >= 1 ? `${parseFloat(totalHours.toFixed(2))} hrs` : `${parseFloat(totalMinutes.toFixed(2))} mins`;
  return totalTime;
});

const nutritionSchema = new Schema<Nutrition>(
  {
    kcal: Number,
    sugars: Number,
    salt: Number,
    carbs: Number,
    protein: Number,
    fat: Number,
    saturates: Number,
    fibre: Number,
  },
  {
    toJSON: {
      virtuals: false, // Don't include virtuals in JSON
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
    toObject: {
      virtuals: false, // Include virtuals in object
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
  },
);

const ingredientSchema = new Schema<Ingredient>(
  {
    item: String,
    measurement: String,
    quantity: Number,
  },
  {
    toJSON: {
      virtuals: false,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
    toObject: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
  },
);

const imageSchema = new Schema<Image>(
  {
    src: String,
    type: String,
    originalName: String,
    storageName: String,
  },
  {
    toJSON: {
      virtuals: false,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
    toObject: {
      virtuals: false,
      transform: function (doc, ret) {
        delete ret._id;
      },
    },
  },
);

const recipeSchema = new Schema<Recipe>(
  {
    name: { type: String, required: true, index: true },
    image: { type: imageSchema, required: false, default: null, alias: 'imageSrc' },
    recipeAuthor: { type: String, required: true, index: true },
    timeToCook: { type: timeToCookSchema, required: true },
    difficulty: {
      type: String,
      required: false,
      default: null,
      enum: ['Easy', 'Medium', 'Hard'],
    },
    labels: { type: [String], required: false, default: null, index: true },
    portions: { type: String, required: true },
    description: { type: String, required: true },
    nutrition: { type: nutritionSchema, required: false, default: null },
    vegan: { type: Boolean, required: false },
    vegetarian: { type: Boolean, required: false },
    ingredients: { type: [ingredientSchema], required: true },
    steps: { type: [String], required: true },
    cuisine: { type: String, required: true },
    creatorId: { type: String, required: true },
    createdAt: { type: Date, required: false },
    updatedAt: { type: Date, required: false },
    __v: { type: Number, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
    virtuals: true,
  },
);

// Custom build function
recipeSchema.statics.build = function (recipeAttrs: Partial<Recipe>) {
  return new RecipeModel(recipeAttrs);
};

// TypeScript type definition for static methods
interface RecipeModelStaticMethods extends mongoose.Model<Recipe> {
  build(recipeAttrs: Partial<Recipe>): Recipe;
}

const RecipeModel = mongoose.model<Recipe, RecipeModelStaticMethods>('Recipe', recipeSchema);

export default RecipeModel;

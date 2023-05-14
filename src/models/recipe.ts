import mongoose, { Schema, Document } from "mongoose";

interface TimeToCook {
	Cook: string;
	Prep: string;
}

interface Nutrition {
	kcal: string;
	sugars: string;
	salt: string;
	carbs: string;
	protein: string;
	fat: string;
	saturates: string;
	fibre: string;
}

interface Ingredient {
	item: string;
	measurement: string;
	quantity: number;
}

export interface Recipe extends Document, RecipeAttributes {}

export interface RecipeAttributes {
	name: string;
	imageSrc: string;
	recipeAuthor: string;
	timeToCook: TimeToCook;
	difficulty: string | null;
	labels: string[];
	portions: string;
	description: string;
	nutrition: Nutrition | null;
	ingredients: Ingredient[];
	steps: string[];
	cuisine: string;
	creatorAuth0Sub: string;
}

const timeToCookSchema = new Schema<TimeToCook>({
	Cook: String,
	Prep: String,
});

const nutritionSchema = new Schema<Nutrition>({
	kcal: String,
	sugars: String,
	salt: String,
	carbs: String,
	protein: String,
	fat: String,
	saturates: String,
	fibre: String,
});

const ingredientSchema = new Schema<Ingredient>({
	item: String,
	measurement: String,
	quantity: Number,
});

const recipeSchema = new Schema<Recipe>({
	name: { type: String, required: true, index: true },
	imageSrc: { type: String, required: false, default: null },
	recipeAuthor: { type: String, required: true, index: true },
	timeToCook: { type: timeToCookSchema, required: true },
	difficulty: { type: String, required: false, default: null },
	labels: { type: [String], required: false, default: null },
	portions: { type: String, required: true },
	description: { type: String, required: true },
	nutrition: { type: nutritionSchema, required: false, default: null },
	ingredients: { type: [ingredientSchema], required: true },
	steps: { type: [String], required: true },
	cuisine: { type: String, required: true },
	creatorAuth0Sub: { type: String, required: true },
});

// Custom build function
recipeSchema.statics.build = function (recipeAttrs: Partial<Recipe>) {
	return new RecipeModel(recipeAttrs);
};

// TypeScript type definition for static methods
interface RecipeModelStaticMethods extends mongoose.Model<Recipe> {
	build(recipeAttrs: Partial<Recipe>): Recipe;
}

const RecipeModel = mongoose.model<Recipe, RecipeModelStaticMethods>(
	"Recipe",
	recipeSchema
);

export default RecipeModel;

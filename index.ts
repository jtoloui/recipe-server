import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import https from "https";
import expressWinston from "express-winston";

import authRoutes from "./src/router/authRoutes";
import { isAdmin, isAuthenticated } from "./src/middleware/isAdmin";
import jwtCheck from "./src/middleware/jwtCheck";
import { managementClient } from "./src/auth/auth0Client";
import assignId from "./src/middleware/requestId";
import logger from "./src/logger/winston";
import { connectDB } from "./src/db";
import RecipeModel from "./src/models/recipe";
import RecipeController from "./src/controllers/Recipe";

dotenv.config();

connectDB();
const app: Express = express();
const port = process.env.PORT;
const logLevel = process.env.LOG_LEVEL || "info";

const winstonLogger = logger(logLevel);

const reactAppOrigin = "https://localhost:3000";

const corsOptions = {
	origin: reactAppOrigin,
	allowedHeaders: ["Content-Type", "Authorization"],
	methods: ["GET", "POST", "PUT", "DELETE"],
};

// jwtCheck middleware will check for a valid JWT on the Authorization header, and attach the decoded token to the request object.
app.use(jwtCheck);

// Helmet helps secure Express apps by setting HTTP response headers.
app.use(helmet());

// Enable CORS
app.use(cors(corsOptions));

// Parse JSON bodies for this app
app.use(bodyParser.json());

// Parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.json());

// Set request ID
app.use(assignId);

// Log requests
app.use(
	expressWinston.logger({
		winstonInstance: winstonLogger,
		meta: false,
		msg: (req, res) =>
			`Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: ${res.statusCode} - ${res.statusMessage}`,
	})
);

// isAuthenticated middleware will check if the user is authenticated and attach the isAuthenticated method to the request object.
app.use(isAuthenticated);

app.use("/auth", authRoutes);

app.get("/", async (req, res) => {
	try {
		const newRecipe = {
			imageSrc:
				"https://images.immediate.co.uk/production/volatile/sites/30/2022/04/Samphire-and-crab-salad-080df73.jpg",
			recipeAuthor: "samuelgoldsmith",
			timeToCook: {
				Cook: "13 mins",
				Prep: "10 mins",
			},
			difficulty: "Easy",
			labels: ["seafood", "salad"],
			portions: "Serves 2-4",
			description:
				"Enjoy this salad as a generous dinner for two, or as a light lunch or supper for four. Samphire sings when paired with crab and this zesty dressing",
			nutrition: {
				kcal: "319",
				sugars: "4g",
				salt: "2.6g",
				carbs: "38g",
				protein: "16g",
				fat: "11g",
				saturates: "3g",
				fibre: "2g",
			},
			ingredients: [
				{
					item: "2 slices of sourdough bread",
					measurement: "2 slices",
					quantity: 1,
				},
				{
					item: "1½ tbsp rapeseed oil",
					measurement: "1½ tbsp",
					quantity: 1,
				},
				{
					item: "180g samphire",
					measurement: "180g",
					quantity: 1,
				},
				{
					item: "1 lemon, juiced",
					measurement: "1 lemon",
					quantity: 1,
				},
				{
					item: "1 tbsp crème fraîche",
					measurement: "1 tbsp",
					quantity: 1,
				},
				{
					item: "1 crab, brown and white meat separated (about 60g of each)",
					measurement: "1 crab",
					quantity: 1,
				},
				{
					item: "1 tbsp chopped dill (optional)",
					measurement: "1 tbsp",
					quantity: 1,
				},
				{
					item: "100g watercress",
					measurement: "100g",
					quantity: 1,
				},
			],
			steps: [
				"Heat the oven to 220C/200C fan/gas 7. Tear the bread into rough chunks and put in a bowl with ½ tbsp rapeseed oil and a little seasoning. Toss well, then tip onto a baking tray. Bake for 8-10 mins until golden. Set aside.",
				"Bring a large pan of water to the boil and cook the samphire for 3 mins before draining and plunging into ice-cold water. Leave to cool for a few minutes before draining.",
				"To make the dressing, combine the lemon juice, crème fraîche, remaining 1 tbsp rapeseed oil, the brown crabmeat and dill, if using, in a small bowl. Season, mix to evenly combine and set aside.",
				"Mix the watercress and drained samphire together in a large bowl, drizzle over the dressing and toss well to coat. Serve on a platter or divide between plates, then top with the white crabmeat and croutons.",
			],
			cuisine: "British",
		};
		await RecipeController.validateModel(newRecipe);

		const recipe = await RecipeModel.find({});

		return res.status(200).json(recipe);
	} catch (error) {
		return res.status(500).json({ error });
	}
});

app.get("/profile", async (req, res) => {
	if (!req.auth || !req.auth.payload.sub) {
		return res.status(401).json({ message: "Unauthorized" });
	}
	const token = req.auth.payload.sub;

	const user = await managementClient.getUser({
		id: token,
	});

	if (user) {
		return res.status(200).json(user);
	}

	return res.status(500).json({ message: "Error getting user" });
});

app.get("/admin", isAdmin, (req, res) => {
	res.send("Hello from admin!");
});

if (process.env.NODE_ENV !== "production") {
	const key = fs.readFileSync("./certs/localhost-key.pem");
	const cert = fs.readFileSync("./certs/localhost.pem");

	https.createServer({ key, cert }, app).listen(3001);
} else {
	app.listen(port, () => {
		console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
	});
}

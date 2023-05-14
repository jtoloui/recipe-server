import express, { Express } from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import https from "https";
import expressWinston from "express-winston";

import authRoutes from "./src/routes/authRoutes";
import { isAuthenticated } from "./src/middleware/isAdmin";
import jwtCheck from "./src/middleware/jwtCheck";
import assignId from "./src/middleware/requestId";
import logger from "./src/logger/winston";
import { connectDB } from "./src/db";
import recipeRoutes from "./src/routes/recipeRoutes";
import { corsOptions } from "./src/utils/cors";

dotenv.config();

connectDB();
const app: Express = express();
const port = process.env.PORT;
// winston logger
const logLevel = process.env.LOG_LEVEL || "info";
const winstonLogger = logger(logLevel);

// middleware - custom
app.use(jwtCheck);
app.use(assignId);
app.use(isAuthenticated);

// middleware - third party
app.use(helmet());
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(
	expressWinston.logger({
		winstonInstance: winstonLogger,
		meta: false,
		msg: (req, res) =>
			`UserId: ${req.auth?.payload.sub} - Request ID: ${req.id} - HTTP ${req.method} ${req.url} - Status: ${res.statusCode} - ${res.statusMessage}`,
	})
);

// Routes
app.use("/auth", authRoutes);
app.use("/api/recipes", recipeRoutes);

if (process.env.NODE_ENV !== "production") {
	const key = fs.readFileSync("./certs/localhost-key.pem");
	const cert = fs.readFileSync("./certs/localhost.pem");

	https.createServer({ key, cert }, app).listen(3001);
} else {
	app.listen(port, () => {
		console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
	});
}

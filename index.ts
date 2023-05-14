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

dotenv.config();

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

app.get("/", (req, res) => {
	res.status(200).json({
		message: "Hello from server!",
	});
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

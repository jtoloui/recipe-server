import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { ConfigParams, auth, requiresAuth } from "express-openid-connect";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";

import authRoutes from "./src/router/authRoutes";
import { isAdmin } from "./src/middleware/isAdmin";

const config: ConfigParams = {
	authRequired: false,
	auth0Logout: true,
	baseURL: "http://localhost:3000",
	clientID: process.env.AUTH0_CLIENT_ID,
	issuerBaseURL: `https://${process.env.AUTH0_DOMAIN}`,
	secret: process.env.AUTH0_SECRET,
};

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

// auth router attaches /login, /logout, and /callback routes to the baseURL
app.use(auth(config));

app.use(helmet());

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.use("/auth", authRoutes);

app.get("/", (req, res) => {
	res.send(req.oidc.isAuthenticated() ? "Logged in" : "Logged out");
});

app.get("/profile", requiresAuth(), (req, res) => {
	res.send(JSON.stringify(req.oidc.user));
});

app.get("/admin", isAdmin, (req, res) => {
	res.send("Hello from admin!");
});

app.listen(port, () => {
	console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

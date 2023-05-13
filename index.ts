import express, { Express } from "express";
import dotenv from "dotenv";
import helmet from "helmet";
import cors from "cors";
import bodyParser from "body-parser";

import authRoutes from "./src/router/authRoutes";
import { isAdmin, isAuthenticated } from "./src/middleware/isAdmin";
import jwtCheck from "./src/middleware/jwtCheck";
import { managementClient } from "./src/auth/auth0Client";

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

app.use(helmet());

const reactAppOrigin = "http://localhost:3000";

const corsOptions = {
	origin: reactAppOrigin,
	allowedHeaders: ["Content-Type", "Authorization"],
	methods: ["GET", "POST", "PUT", "DELETE"],
};

app.use(cors(corsOptions));

app.use(jwtCheck);
app.use(isAuthenticated);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

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
	console.log(req.isAuthenticated());
	res.send("Hello from admin!");
});

app.listen(port, () => {
	console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
});

import { Request, Response, NextFunction } from "express";

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
	if (!req.auth) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const roles = req.auth?.payload["http://toloui-recipe.com/roles"] as string[]; // Use the same namespace as in the Auth0 rule

	if (!roles || !roles.includes("Admin")) {
		return res.status(403).json({ message: "Unauthorized" });
	}

	next();
};

export const isAuthenticated = (
	req: Request,
	res: Response,
	next: NextFunction
) => {
	req.isAuthenticated = () => {
		return !!req.auth;
	};

	next();
};

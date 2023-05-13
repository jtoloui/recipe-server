import { Request, Response, NextFunction } from "express";

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
	if (!req.oidc?.user) {
		return res.status(401).json({ message: "Unauthorized" });
	}

	const roles = req.oidc?.user["http://toloui-recipe.com/roles"]; // Use the same namespace as in the Auth0 rule

	if (!roles || !roles.includes("Admin")) {
		return res.status(403).json({ message: "Unauthorized" });
	}

	next();
};

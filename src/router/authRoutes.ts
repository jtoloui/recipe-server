import express from "express";
import { managementClient } from "../auth/auth0Client";
import { isAdmin } from "../middleware/isAdmin";

const router = express.Router();

router.post("/register", async (req, res) => {
	const { email, password } = req.body;

	try {
		const user = await managementClient.createUser({
			connection: "Username-Password-Authentication", // Replace this with the name of your Auth0 connection
			email,
			password,
			user_metadata: {
				timezone: "Europe/London",
			},
		});

		const assigned = await managementClient.assignRolestoUser(
			{
				id: user.user_id || "",
			},
			{
				roles: ["rol_rsNOujhucO6Kb1jX"],
			}
		);

		const roles = await managementClient.getUserRoles({
			id: user.user_id || "",
		});

		console.log(roles, assigned);

		res.status(201).json({ message: "User created", user });
	} catch (error) {
		console.error("Error creating user:", error);
		res
			.status(500)
			.json({ message: "Error creating user", error: error["message"] });
	}
});

router.post("/delete/user", isAdmin, async (req, res) => {
	const { id } = req.body;

	try {
		const user = await managementClient.getUser({ id });

		const deleted = await managementClient.deleteUser({
			id: user.user_id ?? "",
		});

		res.status(200).json({ message: "User deleted", deleted });
	} catch (error) {
		console.error("Error deleting user:", error);
		res.status(500).json({
			message: "Error deleting user",
			error: error["message"],
		});
	}
});

router.get("/users", isAdmin, async (req, res) => {
	try {
		const users = await managementClient.getUsers();

		res.status(200).json({ message: "Users fetched", users });
	} catch (error) {
		console.error("Error fetching users:", error);
		res.status(500).json({ message: "Error fetching users", error });
	}
});

export default router;

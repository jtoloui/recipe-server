declare namespace Express {
	export interface Request {
		isAuthenticated: () => boolean;
		id: string;
	}
}

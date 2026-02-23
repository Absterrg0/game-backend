import type { Request, Response } from 'express';
import User from '../../models/User';

export async function getMe(req: Request, res: Response) {
	if (!req.isAuthenticated() || !req.user) {
		return res.status(401).json({ message: 'Not authenticated' });
	}

	const user = req.user as InstanceType<typeof User>;
	// Return safe user data (exclude sensitive fields if any)
	res.json({
		user: {
			id: user._id,
			email: user.email,
			name: user.name,
			alias: user.alias,
			dateOfBirth: user.dateOfBirth,
			gender: user.gender,
			userType: user.userType
		}
	});
}

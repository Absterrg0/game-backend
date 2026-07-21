import type { Request, Response } from 'express';
import User from '../../models/User';

/**
 * Session probe for the SPA. Use with optionalAuthenticate so guests get
 * 200 { user: null } instead of 401 (avoids console noise / Lighthouse BP).
 */
export async function getMe(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.json({ user: null });
		return;
	}

	const user = await User.findById(sessionUser._id)
		.select('_id email name alias profilePictureUrl dateOfBirth gender role')
		.lean()
		.exec();

	if (!user) {
		res.json({ user: null });
		return;
	}

	res.json({
		user: {
			id: user._id,
			email: user.email,
			name: user.name,
			alias: user.alias,
			profilePictureUrl: user.profilePictureUrl ?? null,
			dateOfBirth: user.dateOfBirth,
			gender: user.gender,
			role: user.role
		}
	});
}

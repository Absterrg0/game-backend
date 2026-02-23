import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './session';
import type { GoogleProfile } from './types';

export const googleAuth = passport.authenticate('google', {
	scope: ['profile', 'email']
});

export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', async (err: { message?: string }, user: Express.User | false) => {
		if (err || !user) {
			console.log(err);
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		const userDoc = user as InstanceType<typeof User>;
		const userAuth = await UserAuth.findOne({ user: userDoc._id }).exec();
		if (!userAuth) {
			console.log('asikufh');
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		if (!isSignupComplete(userDoc)) {
			const email = userDoc.email ?? '';
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&email=${encodeURIComponent(email)}`);
		}

		req.login(user, (loginErr) => {
			if (loginErr) {
				return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
			}
			res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?success=true`);
		});
	})(req, res, next);
};

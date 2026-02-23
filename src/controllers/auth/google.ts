import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './session';

export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
};

/**
 * Google OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): User+UserAuth already created by passport. Do NOT create session.
 *   Redirect to /auth/callback?signup=true&email=... so frontend routes to UserInformation.
 */
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('google', async (err: { message?: string }, user: Express.User | false) => {
		if (err || !user) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		const userDoc = user as InstanceType<typeof User>;
		const userAuth = await UserAuth.findOne({ user: userDoc._id }).exec();
		if (!userAuth) {
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		// Sign-up: first-time user needs to complete UserInformation form. No session yet.
		if (!isSignupComplete(userDoc)) {
			const email = userDoc.email ?? '';
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&email=${encodeURIComponent(email)}`);
		}

		// Sign-in: existing user. Create session and persist before redirect.
		req.login(user, (loginErr) => {
			if (loginErr) {
				return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
			}
			req.session.save((saveErr) => {
				if (saveErr) return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
				res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?success=true`);
			});
		});
	})(req, res, next);
};

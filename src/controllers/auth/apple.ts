import passport from 'passport';
import type { Request, Response, NextFunction } from 'express';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { isSignupComplete } from './session';

export const appleAuth = passport.authenticate('apple', {
	scope: ['name', 'email']
});

/**
 * Apple OAuth callback. Two paths:
 * - Sign-in (existing user, signup complete): Create session only, redirect home.
 * - Sign-up (first-time user): User+UserAuth already created by passport. Do NOT create session.
 *   Redirect to /auth/callback?signup=true&apple_id=...&email=... so frontend routes to UserInformation.
 */
export const appleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	passport.authenticate('apple', async (err: any, user: Express.User | false) => {
		if (err) {
			if (err === 'AuthorizationError') {
				return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=denied`);
			}
			if (err === 'TokenError') {
				return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=token`);
			}
			return res.redirect(`${process.env.REQUEST_ORIGIN}/auth/callback?error=true`);
		}

		if (!user) {
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
			const appleId = userAuth.appleId ?? '';
			return res.redirect(
				`${process.env.REQUEST_ORIGIN}/auth/callback?signup=true&apple_id=${encodeURIComponent(appleId)}&email=${encodeURIComponent(email)}`
			);
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

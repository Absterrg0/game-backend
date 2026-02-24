import type { Request, Response } from 'express';
import { LogError } from '../../lib/logger';
import User from '../../models/User';
import UserAuth from '../../models/UserAuth';
import { verifyPendingSignupToken } from './pendingToken';
import { DEFAULT_ELO } from '../../constants/elo';
import { isSignupComplete } from './utils';
import { completeSignupSchema } from '../../validation/auth.schemas';

/**
 * Completes first-time signup. Requires a valid pendingToken from the OAuth redirect.
 * Updates the User with profile info and establishes a session.
 * Idempotent: safe to call multiple times — if user is already complete, returns success without creating a new session.
 */
export async function completeSignUp(req: Request, res: Response) {
	const parseResult = completeSignupSchema.safeParse(req.body);
	if (!parseResult.success) {
		const message = parseResult.error.message || 'Validation failed';
		return res.status(400).json({
			message,
			error: true,
			code: 'VALIDATION_ERROR'
		});
	}
	const data = parseResult.data;

	const updatePayload = {
		alias: data.alias,
		name: data.name,
		dateOfBirth: data.dateOfBirth ?? null,
		gender: data.gender ?? null,
		elo: DEFAULT_ELO
	};

	try {
		const payload = verifyPendingSignupToken(data.pendingToken);

		let user: InstanceType<typeof User> | null = null;
		if (payload.appleId) {
			const userAuth = await UserAuth.findOne({ appleId: payload.appleId }).exec();
			if (!userAuth)
				return res
					.status(404)
					.json({ message: 'No user found. Please login with Apple.', error: true, code: 'NO_USER_FOUND' });

			user = (await User.findById(userAuth.user).exec()) ?? null;
		} else if (payload.googleId) {
			const userAuth = await UserAuth.findOne({ googleId: payload.googleId }).exec();
			if (!userAuth)
				return res
					.status(404)
					.json({ message: 'No user found. Please login with Google.', error: true, code: 'NO_USER_FOUND' });

			user = (await User.findById(userAuth.user).exec()) ?? null;
		} else {
			user = (await User.findOne({ email: payload.pendingEmail }).exec()) ?? null;
		}

		if (!user) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		// Idempotent: if user was already complete (e.g. double submit), regenerate session, login, and return success
		if (isSignupComplete(user)) {
			const alreadyLoggedIn = req.isAuthenticated?.() && req.user && String(req.user._id) === String(user._id);
			if (alreadyLoggedIn) {
				return res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
			}
			const userToLogin = user;
			req.session.regenerate((regenErr) => {
				if (regenErr) {
					LogError(__dirname, 'POST', req.originalUrl, regenErr);
					return res.status(500).json({ message: 'Session regeneration failed', error: true, code: 'SIGN_UP_FAILED' });
				}
				req.login(userToLogin, (loginErr) => {
					if (loginErr) {
						LogError(__dirname, 'POST', req.originalUrl, loginErr);
						return res.status(500).json({ message: 'Login failed after signup', error: true, code: 'SIGN_UP_FAILED' });
					}
					req.session.save((saveErr) => {
						if (saveErr) {
							LogError(__dirname, 'POST', req.originalUrl, saveErr);
							return res.status(500).json({ message: 'Session save failed', error: true, code: 'SIGN_UP_FAILED' });
						}
						res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
					});
				});
			});
			return;
		}

		// First-time complete: update user, regenerate session, login
		user = (await User.findByIdAndUpdate(user._id, {
			...updatePayload,
			...(payload.appleId || payload.googleId ? { email: payload.pendingEmail } : {})
		}, { returnDocument: 'after' }).exec()) ?? null;

		if (!user) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		req.session.regenerate((regenErr) => {
			if (regenErr) {
				LogError(__dirname, 'POST', req.originalUrl, regenErr);
				return res.status(500).json({ message: 'Session regeneration failed', error: true, code: 'SIGN_UP_FAILED' });
			}
			req.login(user, (loginErr) => {
				if (loginErr) {
					LogError(__dirname, 'POST', req.originalUrl, loginErr);
					return res.status(500).json({ message: 'Login failed after signup', error: true, code: 'SIGN_UP_FAILED' });
				}
				req.session.save((saveErr) => {
					if (saveErr) {
						LogError(__dirname, 'POST', req.originalUrl, saveErr);
						return res.status(500).json({ message: 'Session save failed', error: true, code: 'SIGN_UP_FAILED' });
					}
					res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
				});
			});
		});
	} catch (error: unknown) {
		LogError(__dirname, 'POST', req.originalUrl, error);
		const isTokenError = error instanceof Error && (
			error.name === 'JsonWebTokenError' ||
			error.name === 'TokenExpiredError' ||
			error.message?.includes('Invalid pending signup token')
		);
		if (isTokenError) {
			return res.status(400).json({ message: 'Invalid or expired signup token. Please login again.', error: true, code: 'INVALID_TOKEN' });
		}
		res.status(500).json({ message: 'Sign up failed', code: 'SIGN_UP_FAILED', error: true });
	}
}

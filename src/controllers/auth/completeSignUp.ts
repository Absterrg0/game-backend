import type { Request, Response } from 'express';
import { LogError } from '../../lib/logger';
import User, { type UserDocument } from '../../models/User';
import { DEFAULT_ELO } from '../../constants/elo';
import { isSignupComplete } from './utils';
import { completeSignupSchema } from '../../validation/auth.schemas';
import { getAuthSession, getDomainUserFromAuthSession } from '../../lib/auth';
/**
 * Completes first-time signup for an authenticated Better Auth user.
 * Updates the linked domain User record. Idempotent: if the profile is already complete,
 * the endpoint returns success without rewriting the record.
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
		const authSession = await getAuthSession(req);
		if (!authSession) {
			return res.status(401).json({
				message: 'Session expired. Please login again.',
				error: true,
				code: 'INVALID_SESSION',
			});
		}

		let user: UserDocument | null = await getDomainUserFromAuthSession(authSession);

		if (!user) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		if (isSignupComplete(user)) {
			return res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
		}

		const sessionEmail =
			typeof authSession.user.email === 'string' && authSession.user.email.trim()
				? authSession.user.email.trim().toLowerCase()
				: undefined;
		const requestedEmail =
			typeof data.email === 'string' && data.email.trim()
				? data.email.trim().toLowerCase()
				: undefined;
		const emailToSet = requestedEmail ?? sessionEmail;

		if (emailToSet) {
			const existingByEmail = await User.findOne({ email: emailToSet, _id: { $ne: user._id } }).exec();
			if (existingByEmail) {
				return res.status(409).json({
					message: 'An account with this email address already exists.',
					error: true,
					code: 'EMAIL_ALREADY_EXISTS'
				});
			}
		}

		user =
			(await User.findByIdAndUpdate(
				user._id,
				{
					...updatePayload,
					...(emailToSet !== undefined ? { email: emailToSet } : {}),
				},
				{ returnDocument: 'after' },
			).exec()) ?? null;

		if (!user) {
			return res.status(404).json({ message: 'No user found. Please login again.', error: true, code: 'NO_USER_FOUND' });
		}

		return res.status(200).json({ message: 'Sign up completed', code: 'SIGNUP_SUCCESSFUL', error: false });
	} catch (error: unknown) {
		LogError('controllers/auth/completeSignUp', 'POST', req.originalUrl, error);
		res.status(500).json({ message: 'Sign up failed', code: 'SIGN_UP_FAILED', error: true });
	}
}

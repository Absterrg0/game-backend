import type { Request, Response } from 'express';
import { logger } from '../../lib/logger';

const AUTH_CALLBACK_PATH = '/auth/callback';

/** True if user has completed signup (alias and name are required). */
export function isSignupComplete(user: Express.User): boolean {
	return !!(user.alias && user.name);
}

/** Builds redirect URL to frontend auth callback with error param. */
export function getErrorRedirect(kind?: string): string {
	const error = encodeURIComponent(kind || 'true');
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?error=${error}`;
}

/** Builds redirect URL to frontend auth callback with success. */
export function getSuccessRedirect(): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}?success=true`;
}

/**
 * Builds redirect URL to frontend auth callback with signup pending token.
 * Token is in the URL fragment (#) so it is never sent to the server (no referrer, logs, or analytics).
 */
export function getSignupRedirect(pendingToken: string): string {
	return `${process.env.REQUEST_ORIGIN}${AUTH_CALLBACK_PATH}#signup=true&pendingToken=${encodeURIComponent(pendingToken)}`;
}

/** Regenerates session, logs in user, saves session, and redirects to success URL. */
export function loginAndRedirect(req: Request, res: Response, user: Express.User): void {
	req.session.regenerate((regenErr) => {
		if (regenErr) {
			logger.error('Error in session regenerate', { regenErr });
			return res.redirect(getErrorRedirect());
		}
		req.login(user, (loginErr) => {
			if (loginErr) {
				logger.error('Error in login', { loginErr });
				return res.redirect(getErrorRedirect());
			}
			req.session.save((saveErr) => {
				if (saveErr) {
					logger.error('Error in session save', { saveErr });
					return res.redirect(getErrorRedirect());
				}
				res.redirect(getSuccessRedirect());
			});
		});
	});
}

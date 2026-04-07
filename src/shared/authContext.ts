import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { UserDocument } from '../models/User';

export type AuthenticatedSession = UserDocument;

/** Use for handlers mounted after `authenticate` (and any role middleware that requires `req.user`). */
export type AuthenticatedRequest = Request & { user: AuthenticatedSession };

export type AuthenticatedHandler = (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction
) => void | Promise<void>;

export type AuthMiddleware = (
	req: AuthenticatedRequest,
	res: Response,
	next: NextFunction
) => void;

function hasAuthenticatedUser(req: Request): req is AuthenticatedRequest {
	return req.user != null;
}

/**
 * Bridges Express RequestHandler typing with middleware-authenticated request typing.
 * If route middleware is misconfigured, forward an internal error via next().
 */
export function withAuthenticated(handler: AuthenticatedHandler): RequestHandler {
	return (req, res, next) => {
		if (!hasAuthenticatedUser(req)) {
			res.status(500).json({
				message: 'Route misconfigured: missing authenticate middleware'
			});
			return;
		}

		return handler(req, res, next);
	};
}

export function buildPermissionContext(session: AuthenticatedSession) {
	return {
		userId: session._id.toString(),
		userRole: session.role,
		adminOf: (session.adminOf ?? []).map((id) => id.toString())
	};
}

import type { NextFunction, RequestHandler, Response, Router } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import authenticate from '../middlewares/auth';
import type { AuthenticatedRequest } from '../shared/authContext';

type AnyMiddleware = RequestHandler;
type FinalHandler<P extends ParamsDictionary = ParamsDictionary> = (
	req: AuthenticatedRequest & { params: P },
	res: Response,
	next: NextFunction
) => any;

export function createAuthedRouter(router: Router) {
	function wrap<P extends ParamsDictionary>(handler: FinalHandler<P>): RequestHandler<P> {
		return (req, res, next) => {
			if (!req.user) {
				res.status(500).json({
					message: 'Route misconfigured: missing authenticate middleware',
				});
				return;
			}

			return handler(req as AuthenticatedRequest & { params: P }, res, next);
		};
	}

	function withMiddleware<P extends ParamsDictionary>(
		middlewares: AnyMiddleware[],
		handler: FinalHandler<P>
	): RequestHandler[] {
			return [authenticate, ...middlewares, wrap(handler) as RequestHandler];
	}

	return {
		get: <P extends ParamsDictionary = ParamsDictionary>(
			path: string,
			...handlers: [...AnyMiddleware[], FinalHandler<P>]
		) => {
			if (!handlers.length) {
				throw new Error('Authenticated route requires a final handler');
			}

			const middlewares = handlers.slice(0, -1) as AnyMiddleware[];
			const handler = handlers[handlers.length - 1] as FinalHandler<P>;

			router.get(path, ...withMiddleware(middlewares, handler));
		},
		post: <P extends ParamsDictionary = ParamsDictionary>(
			path: string,
			...handlers: [...AnyMiddleware[], FinalHandler<P>]
		) => {
			if (!handlers.length) {
				throw new Error('Authenticated route requires a final handler');
			}

			const middlewares = handlers.slice(0, -1) as AnyMiddleware[];
			const handler = handlers[handlers.length - 1] as FinalHandler<P>;

			router.post(path, ...withMiddleware(middlewares, handler));
		},
		put: <P extends ParamsDictionary = ParamsDictionary>(
			path: string,
			...handlers: [...AnyMiddleware[], FinalHandler<P>]
		) => {
			if (!handlers.length) {
				throw new Error('Authenticated route requires a final handler');
			}

			const middlewares = handlers.slice(0, -1) as AnyMiddleware[];
			const handler = handlers[handlers.length - 1] as FinalHandler<P>;

			router.put(path, ...withMiddleware(middlewares, handler));
		},
		delete: <P extends ParamsDictionary = ParamsDictionary>(
			path: string,
			...handlers: [...AnyMiddleware[], FinalHandler<P>]
		) => {
			if (!handlers.length) {
				throw new Error('Authenticated route requires a final handler');
			}

			const middlewares = handlers.slice(0, -1) as AnyMiddleware[];
			const handler = handlers[handlers.length - 1] as FinalHandler<P>;

			router.delete(path, ...withMiddleware(middlewares, handler));
		},
		patch: <P extends ParamsDictionary = ParamsDictionary>(
			path: string,
			...handlers: [...AnyMiddleware[], FinalHandler<P>]
		) => {
			if (!handlers.length) {
				throw new Error('Authenticated route requires a final handler');
			}

			const middlewares = handlers.slice(0, -1) as AnyMiddleware[];
			const handler = handlers[handlers.length - 1] as FinalHandler<P>;

			router.patch(path, ...withMiddleware(middlewares, handler));
		},
	};
}

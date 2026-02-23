import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Express middleware that validates req.body against a Zod schema.
 * On success: assigns parsed data to req.body and calls next().
 * On failure: responds with 400 and formatted error messages.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
	return (req: Request, res: Response, next: NextFunction) => {
		const result = schema.safeParse(req.body);
		if (result.success) {
			req.body = result.data;
			next();
			return;
		}
		const errors = result.error.flatten();
		const fieldErrMap = (errors.fieldErrors ?? {}) as Record<string, string[] | undefined>;
		const messages =
			Object.entries(fieldErrMap)
				.flatMap(([field, msgs]) => (msgs ?? []).map((m: string) => `${field}: ${m}`))
				.join('; ') || result.error.message;
		res.status(400).json({
			message: messages || 'Validation failed',
			error: true,
			code: 'VALIDATION_ERROR',
			details: errors.fieldErrors
		});
	};
}

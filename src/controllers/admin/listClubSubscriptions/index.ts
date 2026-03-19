import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { listClubSubscriptionsFlow } from './handler';

export async function listClubSubscriptions(req: Request, res: Response) {
	try {
		const session = req.user;
		if (!session?._id) {
			res.status(401).json(buildErrorPayload('Not authenticated'));
			return;
		}

		const result = await listClubSubscriptionsFlow();
		if (!result.ok) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(200).json(result.data);
	} catch (err) {
		logger.error('Error listing club subscriptions', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}

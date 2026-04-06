import type { Request, Response } from 'express';
import { logger } from '../../../lib/logger';
import { buildErrorPayload } from '../../../shared/errors';
import { parseBodyWithSchema, parseRouteObjectId } from '../../../shared/validation';
import { addClubStaffSchema } from '../../../validation/club.schemas';
import { addClubStaffFlow } from './handler';
import { AuthenticatedRequest } from '../../../shared';

export async function addClubStaff(req: AuthenticatedRequest, res: Response) {
	try {
	

		const clubIdResult = parseRouteObjectId(req.params.clubId, 'club ID');
		if (clubIdResult.status !== 200) {
			res.status(clubIdResult.status).json(buildErrorPayload(clubIdResult.message));
			return;
		}

		const parsed = parseBodyWithSchema(addClubStaffSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await addClubStaffFlow(clubIdResult.data, parsed.data, req.user);
		if (result.status !== 201) {
			res.status(result.status).json(buildErrorPayload(result.message));
			return;
		}

		res.status(201).json(result.data);
	} catch (err) {
		logger.error('Error adding club staff', { err });
		res.status(500).json(buildErrorPayload('Internal server error'));
	}
}

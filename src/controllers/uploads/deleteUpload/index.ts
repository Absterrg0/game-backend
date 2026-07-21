import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { buildErrorPayload } from '../../../shared/errors';
import { logger } from '../../../lib/logger';
import { deleteImageByCdnUrl, getAssetsConfig } from '../../../lib/assets';
import { parseBodyWithSchema } from '../../../shared/validation';
import { deleteUploadSchema } from '../../../validation/upload.schemas';
import { authorizeCdnUrlDelete } from '../authorizeAsset';

export async function deleteUploadHandler(
	req: AuthenticatedRequest,
	res: Response,
): Promise<void> {
	try {
		const config = getAssetsConfig();
		if (!config.enabled) {
			res
				.status(503)
				.json(buildErrorPayload('Image uploads are not configured on this server'));
			return;
		}

		const parsed = parseBodyWithSchema(deleteUploadSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const authz = await authorizeCdnUrlDelete(req.user, parsed.data.url);
		if (!authz.ok) {
			res.status(authz.status).json(buildErrorPayload(authz.message));
			return;
		}

		await deleteImageByCdnUrl(parsed.data.url, config);
		res.status(200).json({ message: 'Deleted' });
	} catch (err) {
		logger.error('Error deleting uploaded image', { err });
		res.status(500).json(buildErrorPayload('Failed to delete image'));
	}
}

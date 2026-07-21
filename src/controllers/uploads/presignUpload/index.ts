import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { buildErrorPayload } from '../../../shared/errors';
import { logger } from '../../../lib/logger';
import { createPresignedUpload, getAssetsConfig } from '../../../lib/assets';
import { parseBodyWithSchema } from '../../../shared/validation';
import { presignUploadSchema } from '../../../validation/upload.schemas';

export async function createPresignedUploadHandler(
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

		const parsed = parseBodyWithSchema(presignUploadSchema, req.body);
		if (parsed.status !== 200) {
			res.status(parsed.status).json(buildErrorPayload(parsed.message));
			return;
		}

		const result = await createPresignedUpload({
			kind: parsed.data.kind,
			contentType: parsed.data.contentType,
			assetId: parsed.data.assetId,
			config,
		});

		res.status(200).json({
			uploadUrl: result.uploadUrl,
			publicUrl: result.publicUrl,
			key: result.key,
			expiresIn: result.expiresIn,
		});
	} catch (err) {
		logger.error('Error creating presigned upload URL', { err });
		const message = err instanceof Error ? err.message : 'Failed to create upload URL';
		if (message.includes('not configured') || message.includes('Only PNG')) {
			res.status(message.includes('Only PNG') ? 400 : 503).json(buildErrorPayload(message));
			return;
		}
		res.status(500).json(buildErrorPayload('Failed to create upload URL'));
	}
}

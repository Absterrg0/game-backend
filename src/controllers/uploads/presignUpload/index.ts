import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../../shared/authContext';
import { buildErrorPayload } from '../../../shared/errors';
import { logger } from '../../../lib/logger';
import { createPresignedUpload, getAssetsConfig } from '../../../lib/assets';
import { parseBodyWithSchema } from '../../../shared/validation';
import { presignUploadSchema } from '../../../validation/upload.schemas';
import { authorizeAssetWrite } from '../authorizeAsset';

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

		const authz = await authorizeAssetWrite(req.user, parsed.data.kind, parsed.data.assetId);
		if (!authz.ok) {
			res.status(authz.status).json(buildErrorPayload(authz.message));
			return;
		}

		const result = await createPresignedUpload({
			kind: parsed.data.kind,
			contentType: parsed.data.contentType,
			contentLength: parsed.data.contentLength,
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
		if (
			message.includes('not configured') ||
			message.includes('Only PNG') ||
			message.includes('maximum size')
		) {
			res
				.status(message.includes('not configured') ? 503 : 400)
				.json(buildErrorPayload(message));
			return;
		}
		res.status(500).json(buildErrorPayload('Failed to create upload URL'));
	}
}

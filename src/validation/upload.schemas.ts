import { z } from 'zod';
import { ASSET_KINDS, ACCEPTED_UPLOAD_MIME_TYPES } from '../lib/assets';

export const presignUploadSchema = z.object({
	kind: z.enum(ASSET_KINDS),
	contentType: z.enum(ACCEPTED_UPLOAD_MIME_TYPES),
	assetId: z.string().trim().min(1).max(128).optional(),
	/** Exact byte length of the object the client will PUT (bound into the signed URL). */
	contentLength: z.coerce.number().int().positive().max(20 * 1024 * 1024),
});

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const deleteUploadSchema = z.object({
	url: z.string().trim().url(),
});

export type DeleteUploadInput = z.infer<typeof deleteUploadSchema>;

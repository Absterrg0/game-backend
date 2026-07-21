import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertAssetsConfigured, getAssetsConfig, type AssetsConfig } from './config';
import { buildCdnUrl, buildObjectKey, objectKeyFromCdnUrl } from './cdnUrl';
import { deleteObjectKeys, getS3Client, putObjectBuffer } from './s3';
import type { AssetKind } from './types';
import { isAcceptedImageMime } from './types';

const PRESIGN_EXPIRES_SECONDS = 60 * 5;

export type PresignUploadResult = {
	uploadUrl: string;
	publicUrl: string;
	key: string;
	expiresIn: number;
};

export async function createPresignedUpload(params: {
	kind: AssetKind;
	contentType: string;
	assetId?: string;
	config?: AssetsConfig;
}): Promise<PresignUploadResult> {
	if (!isAcceptedImageMime(params.contentType)) {
		throw new Error('Only PNG, JPEG, and WebP images are allowed');
	}

	const config = assertAssetsConfigured(params.config ?? getAssetsConfig());
	const assetId = (params.assetId?.trim() || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '');
	if (!assetId) {
		throw new Error('Invalid asset id');
	}

	const fileId = randomUUID().replace(/-/g, '');
	const key = buildObjectKey({
		prefix: config.prefix,
		kind: params.kind,
		assetId,
		contentType: params.contentType,
		fileId,
	});

	const client = getS3Client(config);
	const command = new PutObjectCommand({
		Bucket: config.bucket,
		Key: key,
		ContentType: params.contentType,
		CacheControl: 'public, max-age=31536000, immutable',
	});

	const uploadUrl = await getSignedUrl(client, command, {
		expiresIn: PRESIGN_EXPIRES_SECONDS,
	});

	return {
		uploadUrl,
		publicUrl: buildCdnUrl(key, config),
		key,
		expiresIn: PRESIGN_EXPIRES_SECONDS,
	};
}

export async function deleteImageByCdnUrl(
	url: string | null | undefined,
	config?: AssetsConfig,
): Promise<void> {
	if (!url) return;
	const resolved = assertAssetsConfigured(config ?? getAssetsConfig());
	const key = objectKeyFromCdnUrl(url, resolved);
	if (!key || !key.startsWith(`${resolved.prefix}/`)) return;
	await deleteObjectKeys([key], resolved);
}

/** Server-side helper for migration scripts (no multer/sharp). */
export async function uploadBufferToAssets(params: {
	buffer: Buffer;
	kind: AssetKind;
	contentType: string;
	assetId?: string;
	config?: AssetsConfig;
}): Promise<{ publicUrl: string; key: string }> {
	const config = assertAssetsConfigured(params.config ?? getAssetsConfig());
	const assetId = (params.assetId?.trim() || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '');
	const fileId = randomUUID().replace(/-/g, '');
	const key = buildObjectKey({
		prefix: config.prefix,
		kind: params.kind,
		assetId,
		contentType: params.contentType,
		fileId,
	});
	await putObjectBuffer({
		key,
		body: params.buffer,
		contentType: params.contentType,
		config,
	});
	return { publicUrl: buildCdnUrl(key, config), key };
}

export function bufferFromDataUrl(value: string): { buffer: Buffer; contentType: string } | null {
	const match = /^data:([^;]+);base64,(.+)$/s.exec(value.trim());
	if (!match) return null;
	return {
		contentType: match[1],
		buffer: Buffer.from(match[2], 'base64'),
	};
}

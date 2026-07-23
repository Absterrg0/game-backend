import type { AssetsConfig } from './config';
import { getAssetsConfig } from './config';
import type { AssetKind } from './types';
import { extensionForMime } from './types';

export function buildObjectKey(params: {
	prefix: string;
	kind: AssetKind;
	assetId: string;
	contentType: string;
	fileId: string;
}): string {
	const ext = extensionForMime(params.contentType);
	return `${params.prefix}/${params.kind}/${params.assetId}/${params.fileId}.${ext}`;
}

export function buildCdnUrl(key: string, config: AssetsConfig = getAssetsConfig()): string {
	return `${config.cdnBaseUrl}/${key}`;
}

/** Extract S3 object key from a CDN URL belonging to our distribution. */
export function objectKeyFromCdnUrl(
	url: string,
	config: AssetsConfig = getAssetsConfig(),
): string | null {
	const trimmed = url.trim();
	if (!trimmed) return null;
	const base = `${config.cdnBaseUrl}/`;
	if (!trimmed.startsWith(base)) return null;
	const key = trimmed.slice(base.length).split('?')[0];
	if (!key || key.includes('..')) return null;
	return key;
}

import { isProd } from '../config';

/**
 * Asset storage config.
 *
 * Isolation rule: never write to the production prefix unless DEPLOY_ENV=production.
 * Staging often runs with NODE_ENV=production — do not use NODE_ENV alone.
 *
 * Prefixes:
 * - production → assets
 * - staging    → stagingassets
 * - development → devassets
 */
export type AssetsConfig = {
	enabled: boolean;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	cdnBaseUrl: string;
	/** First path segment under the bucket, e.g. "devassets" or "assets". */
	prefix: string;
	deployEnv: 'production' | 'staging' | 'development';
	maxUploadBytes: number;
};

function trimSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

export function resolveDeployEnv(): 'production' | 'staging' | 'development' {
	const explicit = (process.env.DEPLOY_ENV ?? process.env.ASSETS_ENV)?.trim().toLowerCase();
	if (explicit === 'production' || explicit === 'staging' || explicit === 'development') {
		return explicit;
	}
	// Staging often uses NODE_ENV=production — never infer production prefix from NODE_ENV alone.
	if (isProd) {
		throw new Error(
			'DEPLOY_ENV (or ASSETS_ENV) must be explicitly set to production, staging, or development when NODE_ENV=production',
		);
	}
	return 'development';
}

function defaultPrefixFor(deployEnv: 'production' | 'staging' | 'development'): string {
	switch (deployEnv) {
		case 'production':
			return 'assets';
		case 'staging':
			return 'stagingassets';
		default:
			return 'devassets';
	}
}

function resolveAssetsPrefix(deployEnv: 'production' | 'staging' | 'development'): string {
	const explicit = process.env.ASSETS_PREFIX?.trim();
	const prefix = (explicit || defaultPrefixFor(deployEnv)).replace(/^\/+|\/+$/g, '');

	if (deployEnv !== 'production' && prefix === 'assets') {
		throw new Error(
			`Refusing to start: ${deployEnv} must not use ASSETS_PREFIX=assets (use ${defaultPrefixFor(deployEnv)})`,
		);
	}

	if (deployEnv === 'production' && prefix !== 'assets') {
		throw new Error(
			`Refusing to start: production must use ASSETS_PREFIX=assets (got "${prefix}")`,
		);
	}

	return prefix;
}

export function getAssetsConfig(): AssetsConfig {
	const accessKeyId = process.env.AWS_S3_KEY_ID?.trim() ?? '';
	const secretAccessKey = process.env.AWS_S3_KEY_SECRET?.trim() ?? '';
	const bucket = process.env.AWS_S3_BUCKET?.trim() || 'tb10assets';
	const region = process.env.AWS_S3_REGION?.trim() || 'eu-central-1';
	const cdnBaseUrl = trimSlash(
		process.env.CDN_BASE_URL?.trim() || 'https://dn1jfspmtx8ws.cloudfront.net',
	);
	const deployEnv = resolveDeployEnv();
	const prefix = resolveAssetsPrefix(deployEnv);
	const maxUploadBytes = Number(process.env.ASSETS_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024);

	const enabled = Boolean(accessKeyId && secretAccessKey);

	return {
		enabled,
		bucket,
		region,
		accessKeyId,
		secretAccessKey,
		cdnBaseUrl,
		prefix,
		deployEnv,
		maxUploadBytes: Number.isFinite(maxUploadBytes) ? maxUploadBytes : 2 * 1024 * 1024,
	};
}

export function assertAssetsConfigured(config: AssetsConfig = getAssetsConfig()): AssetsConfig {
	if (!config.enabled) {
		throw new Error(
			'Image uploads are not configured. Set AWS_S3_KEY_ID and AWS_S3_KEY_SECRET.',
		);
	}
	return config;
}

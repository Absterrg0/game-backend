/**
 * Asset storage config.
 *
 * Two-env isolation (matches Cloud Run services from GitLab CI):
 * - production → `tournament-api-app` → prefix `assets`
 * - development → `tournament-api-app-dev` / local → prefix `devassets`
 *
 * Do not use NODE_ENV alone — Cloud Run often sets NODE_ENV=production on both.
 */
export type AssetsEnv = 'production' | 'development';

export type AssetsConfig = {
	enabled: boolean;
	bucket: string;
	region: string;
	accessKeyId: string;
	secretAccessKey: string;
	cdnBaseUrl: string;
	/** First path segment under the bucket, e.g. "devassets" or "assets". */
	prefix: string;
	assetsEnv: AssetsEnv;
	maxUploadBytes: number;
};

/** Cloud Run service names from `.gitlab-ci-prod.yml` / `.gitlab-ci-dev.yml`. */
const PROD_K_SERVICE = 'tournament-api-app';
const DEV_K_SERVICE = 'tournament-api-app-dev';

/**
 * Resolve assets env from Cloud Run `K_SERVICE` (auto-injected).
 * Local / unknown → development.
 */
export function resolveAssetsEnv(): AssetsEnv {
	const service = process.env.K_SERVICE?.trim() ?? '';
	if (service === PROD_K_SERVICE) {
		return 'production';
	}
	if (service === DEV_K_SERVICE || service === '') {
		return 'development';
	}
	// Any other Cloud Run service name: treat as non-prod (safer than writing to assets/).
	return 'development';
}

function defaultPrefixFor(assetsEnv: AssetsEnv): string {
	return assetsEnv === 'production' ? 'assets' : 'devassets';
}

function resolveAssetsPrefix(assetsEnv: AssetsEnv): string {
	const hasExplicitPrefix = process.env.ASSETS_PREFIX !== undefined;
	const explicit = process.env.ASSETS_PREFIX?.trim() ?? '';
	const prefix = (hasExplicitPrefix ? explicit : defaultPrefixFor(assetsEnv)).replace(
		/^\/+|\/+$/g,
		'',
	);

	if (!/^[A-Za-z0-9_-]+$/.test(prefix)) {
		throw new Error(`Refusing to start: invalid ASSETS_PREFIX "${prefix}"`);
	}

	if (assetsEnv !== 'production' && prefix === 'assets') {
		throw new Error(
			`Refusing to start: ${assetsEnv} must not use ASSETS_PREFIX=assets (use ${defaultPrefixFor(assetsEnv)})`,
		);
	}

	if (assetsEnv === 'production' && prefix !== 'assets') {
		throw new Error(
			`Refusing to start: production must use ASSETS_PREFIX=assets (got "${prefix}")`,
		);
	}

	return prefix;
}

/** Fixed TB10 asset storage (credentials only come from env). */
const ASSETS_BUCKET = 'tb10assets';
const ASSETS_REGION = 'eu-north-1';
const ASSETS_CDN_BASE_URL = 'https://dn1jfspmtx8ws.cloudfront.net';
const ASSETS_MAX_UPLOAD_BYTES_DEFAULT = 2 * 1024 * 1024;

export function getAssetsConfig(): AssetsConfig {
	const accessKeyId = process.env.AWS_S3_KEY_ID?.trim() ?? '';
	const secretAccessKey = process.env.AWS_S3_KEY_SECRET?.trim() ?? '';
	const assetsEnv = resolveAssetsEnv();
	const prefix = resolveAssetsPrefix(assetsEnv);
	const rawMaxUploadBytes = process.env.ASSETS_MAX_UPLOAD_BYTES;
	const maxUploadBytes =
		rawMaxUploadBytes === undefined
			? ASSETS_MAX_UPLOAD_BYTES_DEFAULT
			: Number(rawMaxUploadBytes);
	if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes <= 0) {
		throw new Error('ASSETS_MAX_UPLOAD_BYTES must be a positive integer');
	}

	const enabled = Boolean(accessKeyId && secretAccessKey);

	return {
		enabled,
		bucket: ASSETS_BUCKET,
		region: ASSETS_REGION,
		accessKeyId,
		secretAccessKey,
		cdnBaseUrl: ASSETS_CDN_BASE_URL,
		prefix,
		assetsEnv,
		maxUploadBytes,
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

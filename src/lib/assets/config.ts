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

function trimSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

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
	const explicit = process.env.ASSETS_PREFIX?.trim();
	const prefix = (explicit || defaultPrefixFor(assetsEnv)).replace(/^\/+|\/+$/g, '');

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

export function getAssetsConfig(): AssetsConfig {
	const accessKeyId = process.env.AWS_S3_KEY_ID?.trim() ?? '';
	const secretAccessKey = process.env.AWS_S3_KEY_SECRET?.trim() ?? '';
	const bucket = process.env.AWS_S3_BUCKET?.trim() || 'tb10assets';
	const region = process.env.AWS_S3_REGION?.trim() || 'eu-central-1';
	const cdnBaseUrl = trimSlash(
		process.env.CDN_BASE_URL?.trim() || 'https://dn1jfspmtx8ws.cloudfront.net',
	);
	const assetsEnv = resolveAssetsEnv();
	const prefix = resolveAssetsPrefix(assetsEnv);
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
		assetsEnv,
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

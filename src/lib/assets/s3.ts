import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { assertAssetsConfigured, getAssetsConfig, type AssetsConfig } from './config';

let cachedClient: S3Client | null = null;
let cachedConfigKey: string | null = null;

function configKey(config: AssetsConfig): string {
	return `${config.region}|${config.accessKeyId}|${config.bucket}`;
}

export function getS3Client(config: AssetsConfig = assertAssetsConfigured()): S3Client {
	const key = configKey(config);
	if (cachedClient && cachedConfigKey === key) {
		return cachedClient;
	}
	cachedClient = new S3Client({
		region: config.region,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});
	cachedConfigKey = key;
	return cachedClient;
}

export async function putObjectBuffer(params: {
	key: string;
	body: Buffer;
	contentType: string;
	config?: AssetsConfig;
}): Promise<void> {
	const config = params.config ?? assertAssetsConfigured();
	const client = getS3Client(config);
	await client.send(
		new PutObjectCommand({
			Bucket: config.bucket,
			Key: params.key,
			Body: params.body,
			ContentType: params.contentType,
			CacheControl: 'public, max-age=31536000, immutable',
		}),
	);
}

export async function deleteObjectKeys(keys: string[], config?: AssetsConfig): Promise<void> {
	if (keys.length === 0) return;
	const resolved = config ?? assertAssetsConfigured();
	const client = getS3Client(resolved);

	// S3 DeleteObjects accepts max 1000 keys per call.
	for (let i = 0; i < keys.length; i += 1000) {
		const chunk = keys.slice(i, i + 1000);
		await client.send(
			new DeleteObjectsCommand({
				Bucket: resolved.bucket,
				Delete: {
					Objects: chunk.map((Key) => ({ Key })),
					Quiet: true,
				},
			}),
		);
	}
}

export async function listObjectKeysUnderPrefix(
	prefix: string,
	config?: AssetsConfig,
): Promise<string[]> {
	const resolved = config ?? getAssetsConfig();
	if (!resolved.enabled) return [];
	const client = getS3Client(assertAssetsConfigured(resolved));
	const keys: string[] = [];
	let continuationToken: string | undefined;

	do {
		const page = await client.send(
			new ListObjectsV2Command({
				Bucket: resolved.bucket,
				Prefix: prefix,
				ContinuationToken: continuationToken,
			}),
		);
		for (const item of page.Contents ?? []) {
			if (item.Key) keys.push(item.Key);
		}
		continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
	} while (continuationToken);

	return keys;
}

export const ASSET_KINDS = [
	'user_avatar',
	'club_logo',
	'tournament_logo',
	'sponsor_logo',
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];

export const ACCEPTED_UPLOAD_MIME_TYPES = [
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/webp',
] as const;

export type AcceptedUploadMime = (typeof ACCEPTED_UPLOAD_MIME_TYPES)[number];

export function isAcceptedImageMime(mime: string | undefined): boolean {
	return Boolean(mime && (ACCEPTED_UPLOAD_MIME_TYPES as readonly string[]).includes(mime));
}

export function extensionForMime(mime: string): string {
	switch (mime) {
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		case 'image/jpeg':
		case 'image/jpg':
		default:
			return 'jpg';
	}
}

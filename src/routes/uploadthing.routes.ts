import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { createRouteHandler } from 'uploadthing/express';
import { uploadRouter } from '../lib/uploadthing';
import authenticate from '../middlewares/auth';
import { requireClubAdminOrAbove } from '../middlewares/rbac';

const router = express.Router();

const uploadthingCallbackUrl = process.env.UPLOADTHING_CALLBACK_URL?.trim() || undefined;

/** Matches UploadThing / @uploadthing/shared: `hmac-sha256=` + hex(HMAC-SHA256(payload, apiKey)). */
const UPLOADTHING_SIG_PREFIX = 'hmac-sha256=';

function verifyUploadThingSignature(
	payload: string,
	signatureHeader: string | undefined,
	apiKey: string
): boolean {
	if (!signatureHeader?.startsWith(UPLOADTHING_SIG_PREFIX)) return false;
	const hex = signatureHeader.slice(UPLOADTHING_SIG_PREFIX.length);
	if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return false;
	let received: Buffer;
	try {
		received = Buffer.from(hex, 'hex');
	} catch {
		return false;
	}
	if (received.length === 0) return false;

	const expected = createHmac('sha256', apiKey).update(payload, 'utf8').digest();
	if (expected.length !== received.length) return false;
	return timingSafeEqual(expected, received);
}

function getUploadThingApiKey(): string | undefined {
	const raw = process.env.UPLOADTHING_TOKEN?.trim();
	if (!raw) return undefined;
	try {
		const decoded = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as { apiKey?: string };
		return typeof decoded.apiKey === 'string' ? decoded.apiKey : undefined;
	} catch {
		return undefined;
	}
}

/** Same body string UploadThing's Express adapter uses for HMAC (see toWebRequest). */
function payloadStringForSignature(req: express.Request): string {
	const body = req.body;
	const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
	return typeof bodyStr === 'string' ? bodyStr : '';
}

router.use((req, res, next) => {
	const uploadthingHookHeader = req.headers['uploadthing-hook'];
	const uploadthingHook = Array.isArray(uploadthingHookHeader)
		? uploadthingHookHeader[0]
		: uploadthingHookHeader;

	if (uploadthingHook === 'callback' || uploadthingHook === 'error') {
		// Do not trust the hook header alone (spoofable). Only skip JWT after HMAC verification,
		// matching createRouteHandler's callback/error paths (POST + x-uploadthing-signature).
		if (req.method !== 'POST') {
			authenticate(req, res, () => {
				requireClubAdminOrAbove(req, res, next);
			});
			return;
		}

		const apiKey = getUploadThingApiKey();
		if (!apiKey) {
			res.status(500).json({ message: 'UploadThing is not configured' });
			return;
		}

		const sigHeader = req.headers['x-uploadthing-signature'];
		const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

		if (verifyUploadThingSignature(payloadStringForSignature(req), signature, apiKey)) {
			next();
			return;
		}
		res.status(403).json({ message: 'Invalid signature' });
		return;
	}

	authenticate(req, res, () => {
		requireClubAdminOrAbove(req, res, next);
	});
});

router.use(
	'/',
	createRouteHandler({
		router: uploadRouter,
		config: {
			callbackUrl: uploadthingCallbackUrl,
		},
	})
);

export default router;
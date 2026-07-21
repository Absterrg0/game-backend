import mongoose from 'mongoose';
import type { AuthenticatedSession } from '../../shared/authContext';
import { buildPermissionContext } from '../../shared/authContext';
import { ROLES, hasRoleOrAbove } from '../../constants/roles';
import { userCanManageClub } from '../../lib/permissions';
import Tournament from '../../models/Tournament';
import Sponsor from '../../models/Sponsor';
import type { AssetKind } from '../../lib/assets';
import { ASSET_KINDS } from '../../lib/assets';
import { objectKeyFromCdnUrl, getAssetsConfig } from '../../lib/assets';

export type AssetAuthResult =
	| { ok: true }
	| { ok: false; status: 400 | 403; message: string };

function permissionCtx(session: AuthenticatedSession) {
	return buildPermissionContext(session);
}

/**
 * Resource-level checks before issuing a PUT or deleting a CDN object.
 * - user_avatar: only the signed-in user (assetId must match their id when provided)
 * - club / tournament / sponsor with assetId: must manage that entity
 * - create flows (no assetId yet): any authenticated organiser+ may mint a key
 */
export async function authorizeAssetWrite(
	session: AuthenticatedSession,
	kind: AssetKind,
	assetId: string | undefined,
): Promise<AssetAuthResult> {
	const userId = session._id.toString();

	if (kind === 'user_avatar') {
		if (assetId && assetId !== userId) {
			return { ok: false, status: 403, message: 'Cannot upload an avatar for another user' };
		}
		return { ok: true };
	}

	if (!assetId) {
		if (!hasRoleOrAbove(session.role, ROLES.ORGANISER) && session.role !== ROLES.SUPER_ADMIN) {
			return {
				ok: false,
				status: 403,
				message: 'Organiser access is required to upload this image',
			};
		}
		return { ok: true };
	}

	if (!mongoose.Types.ObjectId.isValid(assetId)) {
		return { ok: false, status: 400, message: 'Invalid asset id' };
	}

	const ctx = permissionCtx(session);

	if (kind === 'club_logo') {
		const allowed = await userCanManageClub(ctx, assetId);
		return allowed
			? { ok: true }
			: { ok: false, status: 403, message: 'You cannot manage this club' };
	}

	if (kind === 'tournament_logo') {
		const tournament = await Tournament.findById(assetId)
			.select('createdBy club')
			.lean<{ createdBy: mongoose.Types.ObjectId; club: mongoose.Types.ObjectId }>()
			.exec();
		if (!tournament) {
			return { ok: false, status: 403, message: 'Tournament not found' };
		}
		if (session.role === ROLES.SUPER_ADMIN) return { ok: true };
		if (tournament.createdBy.toString() === userId) return { ok: true };
		const allowed = await userCanManageClub(ctx, tournament.club.toString());
		return allowed
			? { ok: true }
			: { ok: false, status: 403, message: 'You cannot manage this tournament' };
	}

	if (kind === 'sponsor_logo') {
		const sponsor = await Sponsor.findById(assetId)
			.select('club scope')
			.lean<{ club: mongoose.Types.ObjectId | null; scope?: string }>()
			.exec();
		if (!sponsor) {
			return { ok: false, status: 403, message: 'Sponsor not found' };
		}
		if (session.role === ROLES.SUPER_ADMIN) return { ok: true };
		if (sponsor.club) {
			const allowed = await userCanManageClub(ctx, sponsor.club.toString());
			return allowed
				? { ok: true }
				: { ok: false, status: 403, message: 'You cannot manage this sponsor' };
		}
		// Platform sponsors: super admin only (handled above).
		return { ok: false, status: 403, message: 'You cannot manage this sponsor' };
	}

	return { ok: false, status: 400, message: 'Unknown asset kind' };
}

export async function authorizeCdnUrlDelete(
	session: AuthenticatedSession,
	url: string,
): Promise<AssetAuthResult> {
	const config = getAssetsConfig();
	const key = objectKeyFromCdnUrl(url, config);
	if (!key || !key.startsWith(`${config.prefix}/`)) {
		return { ok: false, status: 400, message: 'URL is not a managed asset' };
	}

	const parts = key.split('/');
	// prefix / kind / assetId / file
	if (parts.length < 4) {
		return { ok: false, status: 400, message: 'Invalid asset key' };
	}
	const kind = parts[1];
	const assetId = parts[2];
	if (!(ASSET_KINDS as readonly string[]).includes(kind)) {
		return { ok: false, status: 400, message: 'Invalid asset kind in key' };
	}

	return authorizeAssetWrite(session, kind as AssetKind, assetId);
}

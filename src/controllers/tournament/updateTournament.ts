import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';
import Court from '../../models/Court';
import { createOrUpdateDraftSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';
import { toDbPayload } from '../../lib/tournamentPayload';
import { logger } from '../../lib/logger';
/**
 * PATCH /api/tournaments/:id
 * Update tournament. Only draft tournaments can be updated. User must have club permission.
 */
export async function updateTournament(req: Request<{ id: string }>, res: Response) {
	try {

		const sessionUser = req.user;
		if (!sessionUser?._id) {
			res.status(401).json({ message: 'Not authenticated' });
			return;
		}

		const id = req.params.id;
		if (!id || !mongoose.Types.ObjectId.isValid(id)) {
			res.status(400).json({ message: 'Invalid tournament ID' });
			return;
		}

		const bodyParse = createOrUpdateDraftSchema.safeParse(req.body);
		if (!bodyParse.success) {
			const msg = bodyParse.error.issues.map((i) => i.message).join('; ');
			res.status(400).json({ message: msg });
			return;
		}

		const tournament = await Tournament.findById(id).lean().exec();
		if (!tournament) {
			res.status(404).json({ message: 'Tournament not found' });
			return;
		}

		if (tournament.status !== 'draft') {
			res.status(400).json({ message: 'Only draft tournaments can be updated. Use publish to activate.' });
			return;
		}

		const clubId = tournament.club.toString();
		const ctx = {
			userId: sessionUser._id,
			userRole: sessionUser.role,
			adminOf: sessionUser.adminOf ?? []
		};

		const canManage = await userCanManageClub(ctx, clubId);
		if (!canManage) {
			res.status(403).json({ message: 'You do not have permission to update this tournament' });
			return;
		}

		const data = bodyParse.data;
		const updateClubId = data.club ?? clubId;
		const isChangingClub = Boolean(data.club && data.club !== clubId);

		// Validate destination club exists (prevents orphan refs; super_admin can pass userCanManageClub without club existing)
		const club = await Club.findById(updateClubId).select('_id').lean().exec();
		if (!club) {
			res.status(404).json({ message: 'Club not found' });
			return;
		}

		if (data.sponsorId) {
			const sponsorOk = await sponsorBelongsToClub(data.sponsorId, updateClubId);
			if (!sponsorOk) {
				res.status(400).json({ message: 'Sponsor must belong to the selected club and be active' });
				return;
			}
		}

		// If changing club, verify permission for new club
		if (isChangingClub) {
			const canManageNew = await userCanManageClub(ctx, data.club!);
			if (!canManageNew) {
				res.status(403).json({ message: 'You do not have permission to assign this tournament to that club' });
				return;
			}
		}

		// Validate courts belong to destination club when provided
		if (Array.isArray(data.courts) && data.courts.length > 0) {
			const invalidCourtIds = data.courts.filter((id) => !mongoose.Types.ObjectId.isValid(id));
			if (invalidCourtIds.length > 0) {
				res.status(400).json({ message: 'Invalid court ID(s). All court IDs must be valid.' });
				return;
			}
			const uniqueValidObjectIds = [...new Set(data.courts)].map((id) => new mongoose.Types.ObjectId(id));
			const courtsInClub = await Court.find({
				_id: { $in: uniqueValidObjectIds },
				club: new mongoose.Types.ObjectId(updateClubId)
			})
				.select('_id')
				.lean()
				.exec();
			if (courtsInClub.length !== uniqueValidObjectIds.length) {
				res.status(400).json({
					message: 'Invalid or out-of-club court ID(s). Each court must exist and belong to the selected club.'
				});
				return;
			}
		}

		// Reject client-supplied status; only server-controlled transitions (e.g. publish) may set it.
		if ('status' in data && data.status !== undefined) {
			res.status(400).json({ message: 'status cannot be set via update; use publish to activate' });
			return;
		}

		const payload = toDbPayload(data);

		// When changing club, clear club-scoped refs not explicitly provided (prevents old sponsor/courts from old club)
		if (isChangingClub) {
			if (!('sponsorId' in data)) payload.sponsorId = null;
			if (!('courts' in data)) payload.courts = [];
		}

		// Mirror Tournament pre('validate') invariant for query updates.
		const effectiveMinMember = data.minMember ?? tournament.minMember;
		const effectiveMaxMember = data.maxMember ?? tournament.maxMember;
		if (
			effectiveMinMember != null &&
			effectiveMaxMember != null &&
			effectiveMaxMember < effectiveMinMember
		) {
			res.status(400).json({
				message: 'maxMember must be greater than or equal to minMember'
			});
			return;
		}
	
		const updated = await Tournament.findByIdAndUpdate(
			id,
			{ $set: payload },
			{ new: true, runValidators: true }
		).lean().exec();

		if (!updated) {
			res.status(404).json({ message: 'Tournament not found' });
			return;
		}

		res.json({
			message: 'Tournament updated',
			tournament: {
				id: updated._id,
				name: updated.name,
				club: updated.club,
				status: updated.status,
				date: updated.date,
				updatedAt: updated.updatedAt
			}
		});
	}
	catch (err: unknown) {
		res.status(500).json({ message: 'Internal server error', error: true });
		logger.error('Error updating tournament', { err });
	}
}

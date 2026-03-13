import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Court from '../../models/Court';
import { createDraftSchema, publishSchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';
import { toDbPayload } from '../../lib/tournamentPayload';

/**
 * POST /api/tournaments
 * Create tournament as draft or publish. Body must include status: 'draft' | 'active'.
 */
export async function createTournament(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const rawBody = req.body as Record<string, unknown>;
	const status = rawBody.status as string | undefined;

	if (!status || !['draft', 'active'].includes(status)) {
		res.status(400).json({ message: 'status must be "draft" or "active"' });
		return;
	}

	const validationInput: Record<string, unknown> = { ...rawBody };
	if (status === 'active' && validationInput.tournamentMode === 'singleDay') {
		const selectedCourts = Array.isArray(validationInput.courts) ? validationInput.courts : [];
		const selectedClubId = typeof validationInput.club === 'string' ? validationInput.club : undefined;

		if (selectedCourts.length === 0 && selectedClubId && mongoose.Types.ObjectId.isValid(selectedClubId)) {
			const clubCourts = await Court.find({
				club: new mongoose.Types.ObjectId(selectedClubId)
			})
				.select('_id')
				.lean()
				.exec();

			if (clubCourts.length === 0) {
				res.status(400).json({
					message: 'Selected club has no courts. Add at least one court before publishing this tournament.'
				});
				return;
			}

			validationInput.courts = clubCourts.map((c) => c._id.toString());
		}
	}

	const schema = status === 'draft' ? createDraftSchema : publishSchema;
	const parsed = schema.safeParse(validationInput);
	if (!parsed.success) {
		const msg = parsed.error.issues.map((i) => i.message).join('; ');
		res.status(400).json({ message: msg, error: true, code: 'VALIDATION_ERROR', details: parsed.error.issues });
		return;
	}

	const data = parsed.data;
	const clubId = data.club;

	const ctx = {
		userId: sessionUser._id,
		userRole: sessionUser.role,
		adminOf: (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[]
	};

	const canManage = await userCanManageClub(ctx, clubId);
	if (!canManage) {
		res.status(403).json({ message: 'You do not have permission to create tournaments for this club' });
		return;
	}

	if (data.sponsorId) {
		const sponsorOk = await sponsorBelongsToClub(data.sponsorId, clubId);
		if (!sponsorOk) {
			res.status(400).json({ message: 'Sponsor must belong to the selected club and be active' });
			return;
		}
	}

	const payload = toDbPayload({ ...data, status });
	payload.club = new mongoose.Types.ObjectId(clubId);
	payload.status = status;

	try {
		const doc = await Tournament.create([payload]);
		const tournament = doc[0];
		res.status(201).json({
			message: status === 'draft' ? 'Draft saved' : 'Tournament published',
			tournament: {
				id: tournament._id,
				name: tournament.name,
				club: tournament.club,
				status: tournament.status,
				date: tournament.date,
				createdAt: tournament.createdAt
			}
		});
	} catch (err) {
		const mongoErr = err as { code?: number; message?: string };
		if (mongoErr.code === 11000) {
			res.status(400).json({ message: 'A tournament with this name already exists', error: true });
			return;
		}
		res.status(500).json({ message: mongoErr.message ?? 'Failed to create tournament', error: true });
	}
}

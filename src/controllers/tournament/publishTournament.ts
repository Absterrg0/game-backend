import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Court from '../../models/Court';
import { publishSchema, publishBodySchema } from '../../validation/tournament.schemas';
import { userCanManageClub, sponsorBelongsToClub } from '../../lib/tournamentPermissions';
import { toDbPayload } from '../../lib/tournamentPayload';
import { buildPublishCandidate } from '../../helpers/publishTournament.helpers';
import { tournamentPublishSourceSchema } from './types/publish';
import { logger } from '../../lib/logger';


/**
 * POST /api/tournaments/:id/publish
 * Publish a draft tournament. Body must contain full publish-valid payload (merge with existing).
 * Idempotent if already active.
 */
export async function publishTournament(req: Request<{ id: string }>, res: Response) {
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

		const tournamentDoc = await Tournament.findById(id).lean().exec();
		if (!tournamentDoc) {
			res.status(404).json({ message: 'Tournament not found' });
			return;
		}
		const tournamentParse = tournamentPublishSourceSchema.safeParse(tournamentDoc);
		if (!tournamentParse.success) {
			res.status(500).json({
				message: 'Stored tournament data is invalid',
				error: true,
				code: 'DATA_INTEGRITY_ERROR',
				details: tournamentParse.error.issues
			});
			return;
		}
		const tournament = tournamentParse.data;

		if (tournament.status === 'active') {
			res.json({
				message: 'Tournament is already published',
				tournament: {
					id: tournament._id,
					name: tournament.name,
					status: tournament.status
				}
			});
			return;
		}

		if (tournament.status !== 'draft') {
			res.status(400).json({ message: 'Only draft tournaments can be published' });
			return;
		}

		if (!tournament.club) {
			res.status(400).json({ message: 'Tournament has no club' });
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
			res.status(403).json({ message: 'You do not have permission to publish this tournament' });
			return;
		}

		// Validate req.body first; merge only parsed/validated data
		const bodyParse = publishBodySchema.safeParse(req.body);
		if (!bodyParse.success) {
			res.status(400).json({
				message: 'Invalid publish request payload',
				error: true,
				code: 'VALIDATION_ERROR',
				details: bodyParse.error.issues
			});
			return;
		}
		const validatedBody = bodyParse.data;

		let publishCandidate = buildPublishCandidate(tournament, validatedBody, clubId);

		// If no explicit tournament courts were selected, fall back to all active club courts.
		if (publishCandidate.tournamentMode === 'singleDay') {
			const selectedCourts = publishCandidate.courts ?? [];
			if (selectedCourts.length === 0) {
				const clubCourts = await Court.find({
					club: new mongoose.Types.ObjectId(clubId)
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

				publishCandidate = {
					...publishCandidate,
					courts: clubCourts.map((court) => court._id.toString())
				};
			}
		}

		const parsed = publishSchema.safeParse(publishCandidate);
		if (!parsed.success) {
			res.status(400).json({
				message: 'Tournament publish validation failed',
				error: true,
				code: 'VALIDATION_ERROR',
				details: parsed.error.issues
			});
			return;
		}

		const data = parsed.data;
		if (data.sponsorId) {
			const sponsorOk = await sponsorBelongsToClub(data.sponsorId, clubId);
			if (!sponsorOk) {
				res.status(400).json({ message: 'Sponsor must belong to the selected club and be active' });
				return;
			}
		}

		const payload = toDbPayload(data, { status: 'active' });
		const updatedTournament = await Tournament.findByIdAndUpdate(id, payload, { new: true }).exec();
		if (!updatedTournament) {
			res.status(404).json({ message: 'Tournament not found' });
			return;
		}

		res.json({
			message: 'Tournament published',
			tournament: {
				id,
				name: data.name,
				club: clubId,
				status: 'active'
			}
		});
	} catch (err: unknown) {
		res.status(500).json({ message: 'Internal server error'});
		logger.error('Error publishing tournament', { err });
	}
}

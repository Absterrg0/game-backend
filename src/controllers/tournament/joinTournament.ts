import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';

async function isUserClubManager(
	user: NonNullable<Request['user']>,
	clubId: string
): Promise<boolean> {
	if (user.role === 'super_admin') return true;

	const isAdmin = (user.adminOf ?? []).some((cid) => cid.toString() === clubId);
	if (isAdmin) return true;

	const club = await Club.findById(clubId).select('organiserIds').lean().exec();
	if (!club) return false;

	const organiserIds = (club.organiserIds ?? []) as Array<mongoose.Types.ObjectId | string>;
	return organiserIds.some((oid) => oid.toString() === user._id.toString());
}

/**
 * POST /api/tournaments/:id/join
 * Join an active tournament.
 */
export async function joinTournament(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
	if (!id || !mongoose.Types.ObjectId.isValid(id)) {
		res.status(400).json({ message: 'Invalid tournament ID' });
		return;
	}

	const tournament = await Tournament.findById(id)
		.select('_id name club status minMember maxMember participants')
		.lean()
		.exec();

	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	if (tournament.status !== 'active') {
		res.status(400).json({ message: 'Only active tournaments can be joined' });
		return;
	}

	const clubId = (tournament.club as mongoose.Types.ObjectId).toString();
	const isManager = await isUserClubManager(sessionUser, clubId);
	if (isManager) {
		res.status(400).json({ message: 'Club managers cannot join this tournament as participants' });
		return;
	}

	const userId = sessionUser._id.toString();
	const participantIds = (tournament.participants ?? []).map((pid) => pid.toString());
	if (participantIds.includes(userId)) {
		res.json({
			message: 'You are already registered for this tournament',
			tournament: {
				id: tournament._id.toString(),
				spotsFilled: participantIds.length,
				spotsTotal: Math.max(1, tournament.maxMember ?? 1),
				isParticipant: true
			}
		});
		return;
	}

	const spotsTotal = Math.max(1, tournament.maxMember ?? 1);
	if (participantIds.length >= spotsTotal) {
		res.status(400).json({ message: 'This tournament is already full' });
		return;
	}

	await Tournament.findByIdAndUpdate(id, { $addToSet: { participants: sessionUser._id } }).exec();

	res.json({
		message: 'Successfully joined tournament',
		tournament: {
			id: tournament._id.toString(),
			spotsFilled: participantIds.length + 1,
			spotsTotal,
			isParticipant: true
		}
	});
}

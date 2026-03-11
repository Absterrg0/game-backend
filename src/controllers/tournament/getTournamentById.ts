import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';
import Sponsor from '../../models/Sponsor';

/**
 * GET /api/tournaments/:id
 * Get tournament details. User must be admin or organiser of the tournament's club.
 */
export async function getTournamentById(req: Request, res: Response) {
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
		.populate('club', 'name')
		.populate('sponsorId', 'name logoUrl link')
		.populate('courts', 'name type placement')
		.populate('participants', 'name alias')
		.lean()
		.exec();

	if (!tournament) {
		res.status(404).json({ message: 'Tournament not found' });
		return;
	}

	const clubId = (tournament.club as { _id?: unknown })?._id ?? tournament.club;
	const clubIdStr = typeof clubId === 'string' ? clubId : (clubId as mongoose.Types.ObjectId)?.toString();

	// Check permission:
	// - active tournaments: any authenticated user can view
	// - draft/inactive tournaments: only club managers can view
	const adminClubs = (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[];
	const isAdmin = adminClubs.some((cid) => cid.toString() === clubIdStr);
	let isOrganiser = false;
	if (!isAdmin && sessionUser.role !== 'super_admin') {
		const club = await Club.findById(clubIdStr).select('organiserIds').lean().exec();
		const organiserIds = (club?.organiserIds ?? []) as Array<mongoose.Types.ObjectId | string>;
		isOrganiser = organiserIds.some((oid) => oid.toString() === sessionUser._id.toString());
	}
	const isManager = isAdmin || isOrganiser || sessionUser.role === 'super_admin';
	if (tournament.status !== 'active' && !isManager) {
			res.status(403).json({ message: 'You do not have permission to view this tournament' });
			return;
	}

	const participants = (tournament.participants ?? []) as Array<{
		_id?: mongoose.Types.ObjectId | string;
		name?: string | null;
		alias?: string | null;
	}>;
	const participantItems = participants
		.map((p) => {
			const participantId = p?._id?.toString?.() ?? '';
			return {
				id: participantId,
				name: p.name ?? null,
				alias: p.alias ?? null
			};
		})
		.filter((p) => Boolean(p.id));
	const participantIdSet = new Set(participantItems.map((p) => p.id));

	const spotsFilled = participantItems.length;
	const spotsTotal = Math.max(1, tournament.maxMember ?? 1);
	const isParticipant = participantIdSet.has(sessionUser._id.toString());
	const canJoin = tournament.status === 'active' && !isManager && !isParticipant && spotsFilled < spotsTotal;

	const clubObj =
		tournament.club && typeof tournament.club === 'object'
			? (tournament.club as { _id?: unknown; name?: string })
			: null;
	const sponsorObj =
		tournament.sponsorId && typeof tournament.sponsorId === 'object'
			? (tournament.sponsorId as { _id?: unknown; name?: string; logoUrl?: string | null; link?: string | null })
			: null;
	const courts = ((tournament.courts ?? []) as Array<{
		_id?: mongoose.Types.ObjectId | string;
		name?: string;
		type?: string;
		placement?: string;
	}>).map((court) => ({
		id: court._id?.toString?.() ?? '',
		name: court.name ?? '',
		type: court.type ?? null,
		placement: court.placement ?? null
	}));

	const clubSponsors = await Sponsor.find({
		scope: 'club',
		clubId: new mongoose.Types.ObjectId(clubIdStr),
		status: 'active'
	})
		.select('name logoUrl link')
		.lean()
		.exec();

	const clubSponsorsList = clubSponsors.map((s) => ({
		id: s._id.toString(),
		name: s.name ?? '',
		logoUrl: s.logoUrl ?? null,
		link: s.link ?? null
	}));

	res.json({
		tournament: {
			id: tournament._id.toString(),
			name: tournament.name,
			logo: tournament.logo ?? null,
			club: clubObj
				? {
						id: String(clubObj._id),
						name: clubObj.name ?? ''
					}
				: null,
			sponsor: sponsorObj
				? {
						id: String(sponsorObj._id),
						name: sponsorObj.name ?? '',
						logoUrl: sponsorObj.logoUrl ?? null,
						link: sponsorObj.link ?? null
					}
				: null,
			clubSponsors: clubSponsorsList,
			date: tournament.date ? new Date(tournament.date).toISOString() : null,
			startTime: tournament.startTime ?? null,
			endTime: tournament.endTime ?? null,
			playMode: tournament.playMode,
			tournamentMode: tournament.tournamentMode,
			memberFee: tournament.memberFee ?? 0,
			externalFee: tournament.externalFee ?? 0,
			minMember: tournament.minMember ?? 1,
			maxMember: tournament.maxMember ?? 1,
			playTime: tournament.playTime ?? null,
			pauseTime: tournament.pauseTime ?? null,
			courts,
			foodInfo: tournament.foodInfo ?? '',
			descriptionInfo: tournament.descriptionInfo ?? '',
			numberOfRounds: tournament.numberOfRounds ?? 1,
			roundTimings: (tournament.roundTimings ?? []).map((r) => ({
				startDate: r?.startDate ? new Date(r.startDate).toISOString() : null,
				endDate: r?.endDate ? new Date(r.endDate).toISOString() : null
			})),
			status: tournament.status,
			participants: participantItems,
			progress: {
				spotsFilled,
				spotsTotal,
				percentage: Math.round((spotsFilled / spotsTotal) * 100)
			},
			permissions: {
				canEdit: isManager,
				canJoin,
				isParticipant
			},
			createdAt: tournament.createdAt ? new Date(tournament.createdAt).toISOString() : null,
			updatedAt: tournament.updatedAt ? new Date(tournament.updatedAt).toISOString() : null
		}
	});
}

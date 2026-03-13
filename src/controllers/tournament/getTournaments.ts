import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Tournament from '../../models/Tournament';
import Club from '../../models/Club';
import { escapeRegex } from '../../lib/validation';
import { hasRoleOrAbove } from '../../constants/roles';
import { ROLES } from '../../constants/roles';

/**
 * GET /api/tournaments
 * - Players: list published tournaments only (active, inactive).
 * - Organisers+: list tournaments for clubs they manage; supports view=published|drafts.
 * Query: page, limit, status, clubId, q (search), view (published|drafts, organiser only)
 */
export async function getTournaments(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
	const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
	const status = req.query.status as string | undefined;
	const clubId = req.query.clubId as string | undefined;
	const q = req.query.q as string | undefined;
	const view = req.query.view as string | undefined; // 'published' | 'drafts' (organiser only)

	const skip = (page - 1) * limit;
	const isOrganiserOrAbove = hasRoleOrAbove(sessionUser.role, ROLES.ORGANISER);

	// Get clubs user can manage (admin or organiser) - only used for organisers
	let manageableClubIds: mongoose.Types.ObjectId[] = [];
	if (isOrganiserOrAbove) {
		const adminClubs = (sessionUser.adminOf ?? []) as mongoose.Types.ObjectId[];
		const organiserClubs = await Club.find({
			organiserIds: sessionUser._id,
			status: 'active'
		})
			.select('_id')
			.lean()
			.exec();
		const organiserClubIds = organiserClubs.map((c) => c._id);
		manageableClubIds = [
			...new Set([...adminClubs.map((id) => id.toString()), ...organiserClubIds.map((id) => id.toString())])
		].map((id) => new mongoose.Types.ObjectId(id));
	}

	const filter: Record<string, unknown> = {};

	if (isOrganiserOrAbove) {
		// Organiser: filter by manageable clubs
		if (clubId) {
			if (!mongoose.Types.ObjectId.isValid(clubId)) {
				res.status(400).json({ message: 'Invalid club ID' });
				return;
			}
			const inManageable = manageableClubIds.some((id) => id.toString() === clubId);
			if (!inManageable) {
				res.status(403).json({ message: 'You do not have permission to view tournaments for this club' });
				return;
			}
			filter.club = new mongoose.Types.ObjectId(clubId);
		} else {
			if (manageableClubIds.length === 0) {
				return res.json({
					tournaments: [],
					pagination: { total: 0, page: 1, limit, totalPages: 0 }
				});
			}
			filter.club = { $in: manageableClubIds };
		}

		// View param: published = active+inactive, drafts = draft only
		if (view === 'drafts') {
			filter.status = 'draft';
		} else {
			// published tab or default
			filter.status = status && ['active', 'inactive'].includes(status)
				? status
				: { $in: ['active', 'inactive'] };
		}
	} else {
		// Player: only published tournaments from all clubs
		filter.status =
			status && ['active', 'inactive'].includes(status) ? status : { $in: ['active', 'inactive'] };
	}

	if (q && q.trim()) {
		filter.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
	}

	const [tournaments, total] = await Promise.all([
		Tournament.find(filter)
			.populate('club', 'name')
			.populate('sponsorId', 'name logoUrl link')
			.sort({ date: -1, createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.lean()
			.exec(),
		Tournament.countDocuments(filter)
	]);

	const items = tournaments.map((t) => {
		const clubObj = t.club && typeof t.club === 'object' ? (t.club as { _id?: unknown; name?: string }) : null;
		return {
			id: t._id,
			name: t.name,
			club: clubObj ? { id: clubObj._id, name: clubObj.name } : null,
			date: t.date ? (t.date as Date).toISOString?.() ?? String(t.date) : null,
			status: t.status,
			sponsorId: t.sponsorId
		};
	});

	res.json({
		tournaments: items,
		pagination: {
			total,
			page,
			limit,
			totalPages: Math.ceil(total / limit)
		}
	});
}

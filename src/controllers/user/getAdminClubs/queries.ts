import mongoose from 'mongoose';
import Court from '../../../models/Court';
import Club from '../../../models/Club';
import Tournament from '../../../models/Tournament';
import User from '../../../models/User';
import type { AdminClubDoc, CourtCountRow, UserAdminClubsDoc } from './types';

export async function findUserAdminClubs(userId: string) {
	const [user, organiserClubs] = await Promise.all([
		User.findById(userId)
			.populate({
				path: 'adminOf',
				select: '_id name',
				model: 'Club'
			})
			.select('adminOf')
			.lean<UserAdminClubsDoc>()
			.exec(),
		Club.find({ organiserIds: userId })
			.select('_id name')
			.lean<AdminClubDoc[]>()
			.exec()
	]);

	if (!user) {
		return null;
	}

	const merged = new Map<string, AdminClubDoc>();

	for (const club of user.adminOf ?? []) {
		merged.set(club._id.toString(), club);
	}

	for (const club of organiserClubs ?? []) {
		merged.set(club._id.toString(), club);
	}

	return Array.from(merged.values()).sort((left, right) => {
		const byName = left.name.localeCompare(right.name);

		if (byName !== 0) {
			return byName;
		}

		return left._id.toString().localeCompare(right._id.toString());
	});
}

export async function findCourtCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const courtCounts = await Court.aggregate<CourtCountRow>([
		{ $match: { club: { $in: clubIds } } },
		{ $group: { _id: '$club', count: { $sum: 1 } } }
	]).exec();

	return new Map(courtCounts.map((item) => [item._id.toString(), item.count]));
}

/** Users who favorited the club (excludes soft-deleted accounts). */
export async function findFavoriteMemberCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const notDeleted = {
		$or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
	};

	const memberCounts = await User.aggregate<CourtCountRow>([
		{
			$match: {
				...notDeleted,
				favoriteClubs: { $in: clubIds }
			}
		},
		{ $unwind: '$favoriteClubs' },
		{ $match: { favoriteClubs: { $in: clubIds } } },
		{ $group: { _id: '$favoriteClubs', count: { $sum: 1 } } }
	]).exec();

	return new Map(memberCounts.map((item) => [item._id.toString(), item.count]));
}

export async function findTournamentCountsByClub(clubIds: mongoose.Types.ObjectId[]) {
	if (!clubIds.length) {
		return new Map<string, number>();
	}

	const tournamentCounts = await Tournament.aggregate<CourtCountRow>([
		{ $match: { club: { $in: clubIds } } },
		{ $group: { _id: '$club', count: { $sum: 1 } } }
	]).exec();

	return new Map(tournamentCounts.map((item) => [item._id.toString(), item.count]));
}

import type { Types } from 'mongoose';
import Club, { type ClubPlan } from '../../../models/Club';
import User from '../../../models/User';

export interface ClubSubscriptionSnapshot {
	_id: Types.ObjectId;
	name: string;
	plan: ClubPlan;
	expiresAt: Date | null;
	organiserIds: Types.ObjectId[];
}

export interface ClubAdminCount {
	_id: Types.ObjectId;
	adminCount: number;
}

export async function findClubSubscriptionSnapshots() {
	return Club.find(
		{},
		{ _id: 1, name: 1, plan: 1, expiresAt: 1, organiserIds: 1 }
	)
		.sort({ name: 1 })
		.lean<ClubSubscriptionSnapshot[]>()
		.exec();
}

export async function findAdminCountsByClub() {
	return User.aggregate<ClubAdminCount>([
		{ $unwind: '$adminOf' },
		{ $group: { _id: '$adminOf', adminCount: { $sum: 1 } } }
	]).exec();
}

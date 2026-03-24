import type mongoose from 'mongoose';
import Session from '../../../models/Session';
import Tournament from '../../../models/Tournament';
import User from '../../../models/User';
import UserAuth from '../../../models/UserAuth';

function buildDeletedValue(value: string | null | undefined, deletionSuffix: string) {
	if (!value) return value;
	return `deleted-${deletionSuffix}-${value}`;
}

export async function deleteUserSessions(userId: string, session: mongoose.ClientSession) {
	await Session.deleteMany({ user: userId }).session(session);
}

export async function removeUserFromTournamentParticipants(userId: string, session: mongoose.ClientSession) {
	await Tournament.updateMany(
		{ participants: userId },
		{ $pull: { participants: userId } },
		{ session }
	);
}

export async function softDeleteUser(userId: string, session: mongoose.ClientSession) {
	const user = await User.findById(userId).setOptions({ includeDeleted: true }).session(session);

	if (!user) {
		return null;
	}

	const deletionSuffix = Date.now().toString();

	const updatedUser = await User.findByIdAndUpdate(
		userId,
		{
			email: buildDeletedValue(user.email, deletionSuffix),
			alias: buildDeletedValue(user.alias, deletionSuffix),
			name: buildDeletedValue(user.name, deletionSuffix),
			deletedAt: new Date(),
			status: 'inactive'
		},
		{ new: true, session }
	).session(session);

	const userAuth = await UserAuth.findOne({ user: user._id }).session(session);

	if (userAuth) {
		await UserAuth.findOneAndUpdate(
			{ user: user._id },
			{
				googleId: buildDeletedValue(userAuth.googleId, deletionSuffix),
				appleId: buildDeletedValue(userAuth.appleId, deletionSuffix)
			},
			{ session }
		);
	}

	return updatedUser;
}

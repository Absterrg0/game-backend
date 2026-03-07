import { type Request, type Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';
import Tournament from '../../models/Tournament';
import { getAuthCollectionNames, getAuthSession } from '../../lib/auth';

/** Requires authenticate middleware - req.user is guaranteed. Deletes the authenticated user's account and all related data. */
export async function deleteAccount(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const userId = sessionUser._id;

	try {
		const authSession = await getAuthSession(req);
		if (!authSession) {
			res.status(401).json({ message: 'Not authenticated' });
			return;
		}

		const db = mongoose.connection.db;
		if (!db) {
			throw new Error('Database connection not ready');
		}
		const authCollections = getAuthCollectionNames();
		const session = await mongoose.connection.startSession();

		try {
			await session.withTransaction(async () => {
				await db.collection(authCollections.session).deleteMany(
					{ userId: authSession.user.id },
					{ session }
				);
				await db.collection(authCollections.account).deleteMany(
					{ userId: authSession.user.id },
					{ session }
				);
				await db.collection(authCollections.user).deleteOne(
					{ id: authSession.user.id },
					{ session }
				);

				await Tournament.updateMany(
					{ $or: [{ participants: userId }, { dropouts: userId }] },
					{ $pull: { participants: userId, dropouts: userId } },
					{ session }
				);

				const result = await User.findByIdAndUpdate(
					userId,
					{ deletedAt: new Date() },
					{ new: true }
				).session(session);
				if (!result) {
					throw new Error('User not found');
				}
			});
		} finally {
			await session.endSession();
		}

		res.json({ message: 'Account deleted successfully' });
	} catch (err) {
		res.status(500).json({
			message: 'Failed to delete account',
			error: true,
			code: 'DELETE_ACCOUNT_FAILED',
		});
	}
}

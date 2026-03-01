import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';

/** Requires authenticate middleware. */
export async function setHomeClub(req: Request, res: Response) {
	const sessionUser = req.user;
	if (!sessionUser?._id) {
		res.status(401).json({ message: 'Not authenticated' });
		return;
	}

	const { clubId } = req.body as { clubId: string };
	if (!clubId || !mongoose.Types.ObjectId.isValid(clubId)) {
		res.status(400).json({ message: 'Invalid club ID' });
		return;
	}

	const user = await User.findById(sessionUser._id);
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	const clubObjId = new mongoose.Types.ObjectId(clubId);
	const isInFavorites = user.favoriteClubs.some((id) => id.equals(clubObjId));
	if (!isInFavorites) {
		res.status(400).json({ message: 'Club must be in favorites to set as home club' });
		return;
	}

	user.homeClub = clubObjId;
	await user.save();

	res.json({ message: 'Home club updated' });
}

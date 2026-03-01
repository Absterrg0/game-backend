import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import User from '../../models/User';
import Club from '../../models/Club';

/** Requires authenticate middleware. */
export async function addFavoriteClub(req: Request, res: Response) {
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

	const club = await Club.findById(clubId).select('_id').exec();
	if (!club) {
		res.status(404).json({ message: 'Club not found' });
		return;
	}

	const user = await User.findById(sessionUser._id);
	if (!user) {
		res.status(404).json({ message: 'User not found' });
		return;
	}

	const clubObjId = new mongoose.Types.ObjectId(clubId);
	if (user.favoriteClubs.some((id) => id.equals(clubObjId))) {
		res.status(400).json({ message: 'Club already in favorites' });
		return;
	}

	user.favoriteClubs.push(clubObjId);
	await user.save();

	res.json({ message: 'Club added to favorites' });
}

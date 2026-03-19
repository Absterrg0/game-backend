import { error, ok } from '../../../shared/helpers';
import type { UpdateClubSubscriptionInput } from './validation';
import { findClubSubscriptionByIdForUpdate } from './queries';

export async function updateClubSubscriptionFlow(
	clubId: string,
	payload: UpdateClubSubscriptionInput
) {
	const club = await findClubSubscriptionByIdForUpdate(clubId);

	if (!club) {
		return error(404, 'Club not found');
	}

	const newPlan = payload.plan;
	const newExpiresAt = payload.expiresAt;

	let finalPlan: 'free' | 'premium';
	let finalExpiresAt: Date | null;

	if (newPlan === 'free') {
		finalPlan = 'free';
		finalExpiresAt = null;
	} else if (newPlan === 'premium') {
		if (newExpiresAt === undefined || newExpiresAt === null) {
			return error(400, 'Premium plan requires a future expiration date');
		}
		finalPlan = 'premium';
		finalExpiresAt = newExpiresAt;
	} else {
		if (newExpiresAt !== undefined) {
			if (newExpiresAt === null) {
				finalPlan = 'free';
				finalExpiresAt = null;
			} else {
				finalPlan = 'premium';
				finalExpiresAt = newExpiresAt;
			}
		} else if (club.expiresAt != null) {
			finalPlan = 'premium';
			finalExpiresAt = club.expiresAt;
		} else {
			finalPlan = 'free';
			finalExpiresAt = null;
		}
	}

	club.plan = finalPlan;
	club.expiresAt = finalExpiresAt;

	await club.save();

	return ok(
		{
			club: {
				id: club._id,
				plan: club.plan,
				expiresAt: club.expiresAt,
			},
		},
		{ status: 200, message: 'Club subscription updated successfully' }
	);
}

import { error, ok } from '../../../shared/helpers';
import type { UpdateClubSubscriptionInput } from './validation';
import { findClubSubscriptionByIdForUpdate } from './queries';

export async function updateClubSubscriptionFlow(clubId: string, payload: UpdateClubSubscriptionInput) {
	const club = await findClubSubscriptionByIdForUpdate(clubId);
	if (!club) {
		return error(404, 'Club not found');
	}

	// If a new plan is specified in the payload, set it
	if (payload.plan !== undefined) {
		club.plan = payload.plan;
	}

	// If an expiresAt value is specified in the payload, set it
	if (payload.expiresAt !== undefined) {
		club.expiresAt = payload.expiresAt;
	}

	// If the club has an expiry date (i.e., they're subscribing), set plan to premium
	if (club.expiresAt !== null) {
		club.plan = 'premium';
	}

	// If the plan is free, always clear expiration
	if (club.plan === 'free') {
		club.expiresAt = null;
	}

	await club.save();

	return ok(
		{
			club: {
				id: club._id,
				plan: club.plan,
				expiresAt: club.expiresAt
			}
		},
		{ status: 200, message: 'Club subscription updated successfully' }
	);
}

import { error, ok } from '../../../shared/helpers';
import { findAdminCountsByClub, findClubSubscriptionSnapshots } from './queries';

function getStatus(plan: 'free' | 'premium', expiresAt: Date | null) {
	if (plan === 'free') return 'nothing' as const;
	if (!expiresAt) return 'requested' as const;
	if (expiresAt.getTime() < Date.now()) return 'renewal_needed' as const;
	return 'subscribed' as const;
}

export async function listClubSubscriptionsFlow() {
	try {
		const [clubs, adminCounts] = await Promise.all([
			findClubSubscriptionSnapshots(),
			findAdminCountsByClub()
		]);

		const adminCountMap = new Map<string, number>(
			adminCounts.map((entry) => [entry._id.toString(), entry.adminCount])
		);

		const rows = clubs.map((club) => {
			const adminCount = adminCountMap.get(club._id.toString()) ?? 0;
			const organiserCount = club.organiserIds?.length ?? 0;
			const members = adminCount + organiserCount;

			return {
				id: club._id.toString(),
				name: club.name,
				members,
				subscription: {
					plan: club.plan,
					expiresAt: club.expiresAt,
					status: getStatus(club.plan, club.expiresAt)
				}
			};
		});

		return ok({ clubs: rows }, { status: 200, message: 'Club subscriptions listed successfully' });
	} catch (_err) {
		return error(500, 'Failed to load club subscriptions');
	}
}

import mongoose from 'mongoose';
import Club from '../../../models/Club';
import { error } from '../../../shared/helpers';
import type { RemoveClubStaffAccess } from './authenticate';
import {
	findClubStaffSnapshotById,
	findClubStaffUserSnapshotById,
	removeUserAdminOfClub,
	removeUserAsClubOrganiser
} from '../shared/queries';

export type RemoveClubStaffTransactionResult = { ok: true } | ReturnType<typeof error>;

/**
 * Re-reads club (default admin, organisers) and user (adminOf) inside one transaction,
 * validates rules, then applies User/Club removals together.
 */
export async function removeClubStaffTransaction(
	clubId: string,
	staffId: string,
	access: Pick<
		RemoveClubStaffAccess,
		'canManageOrganisers' | 'canManageAdmins' | 'canRemoveDefaultAdmin'
	>
): Promise<RemoveClubStaffTransactionResult> {
	const session = await mongoose.startSession();
	try {
		return await session.withTransaction(async () => {
			const club = await findClubStaffSnapshotById(clubId, session);
			if (!club) {
				return error(404, 'Club not found');
			}

			const defaultAdminId = club.defaultAdminId?.toString() ?? null;
			const isDefaultAdminTarget = defaultAdminId === staffId;

			const organiserIds = (club.organiserIds ?? []).map((id) => id.toString());
			const user = await findClubStaffUserSnapshotById(staffId, session);
			if (!user) {
				return error(404, 'User not found');
			}

			const isAdmin = (user.adminOf ?? []).some((id) => id.toString() === clubId);
			const isOrganiser = organiserIds.includes(staffId);

			if (!isAdmin && !isOrganiser) {
				return error(404, 'Staff member not found in this club');
			}

			if (isAdmin && isDefaultAdminTarget && !access.canRemoveDefaultAdmin) {
				return error(403, 'Only super admins can remove the default admin');
			}

			if (isAdmin && !isDefaultAdminTarget && !access.canManageAdmins) {
				return error(403, 'Only the main admin can remove other admins');
			}

			if (isOrganiser && !access.canManageOrganisers) {
				return error(403, 'Only club admins can remove organisers');
			}

			if (isAdmin) {
				await removeUserAdminOfClub(clubId, staffId, session);

				if (isDefaultAdminTarget) {
					await Club.updateOne(
						{ _id: clubId, defaultAdminId: new mongoose.Types.ObjectId(staffId) },
						{ $set: { defaultAdminId: null } }
					)
						.session(session)
						.exec();
				}
			}

			if (isOrganiser) {
				await removeUserAsClubOrganiser(clubId, staffId, session);
			}

			return { ok: true as const };
		});
	} finally {
		await session.endSession().catch(() => {});
	}
}

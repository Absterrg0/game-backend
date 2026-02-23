import type { IUser } from '../../models/User';

/** True if user has completed signup (at least alias, name, dateOfBirth, or gender set). */
export function isSignupComplete(user: IUser): boolean {
	return !!(user?.alias || user?.name || user?.dateOfBirth != null || user?.gender != null);
}

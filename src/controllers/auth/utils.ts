/** True if user has completed signup (alias and name are required). */
export function isSignupComplete(user: Express.User): boolean {
	return !!(user.alias && user.name);
}

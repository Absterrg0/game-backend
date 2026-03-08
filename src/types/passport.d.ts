declare module 'passport-google-oauth20' {
	import type { Strategy } from 'passport';
	const GoogleStrategy: new (...args: unknown[]) => Strategy;
	export { GoogleStrategy as Strategy };
}

declare module 'passport-apple' {
	import type { Strategy } from 'passport';

	/** State store contract matching passport-oauth2's state-store interface. */
	export interface OAuthStore {
		store(
			req: unknown,
			verifier: string | undefined,
			state: unknown,
			meta: unknown,
			cb: (err: Error | null, stateHandle?: string) => void
		): void;
		verify(
			req: unknown,
			providedState: string,
			meta: unknown,
			cb: (err: Error | null, ok: boolean | string, state?: unknown) => void
		): void;
	}

	export interface AppleStrategyOptions {
		clientID: string;
		teamID: string;
		keyID: string;
		callbackURL: string;
		privateKeyString?: string;
		privateKeyLocation?: string;
		passReqToCallback?: boolean;
		responseType?: string;
		scope?: string[];
		store?: OAuthStore;
	}

	export type VerifyCallback = (err: Error | null, user?: unknown) => void;
	const AppleStrategy: new (options: AppleStrategyOptions, verify: (...args: unknown[]) => void) => Strategy;
	export { AppleStrategy as Strategy };
}

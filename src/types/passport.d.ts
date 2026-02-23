declare module 'passport-google-oauth20' {
	import type { Strategy } from 'passport';
	const GoogleStrategy: new (...args: unknown[]) => Strategy;
	export { GoogleStrategy as Strategy };
}

declare module 'passport-apple' {
	import type { Strategy } from 'passport';
	export type VerifyCallback = (err: Error | null, user?: unknown) => void;
	const AppleStrategy: new (...args: unknown[]) => Strategy;
	export { AppleStrategy as Strategy };
}

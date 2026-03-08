import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy } from 'passport-apple';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import UserAuth from '../models/UserAuth';
import { logger } from '../lib/logger';

async function findOrCreateUserByEmail(email: string, session: mongoose.ClientSession) {
	const existing = await User.findOne({ email }).session(session);
	if (existing) return { user: existing, created: false };

	const [newUser] = await User.create([{ email }], { session });
	if (!newUser) throw new Error('User creation failed');
	return { user: newUser, created: true };
}

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
	passport.use(
		new GoogleStrategy(
			{
				clientID: process.env.GOOGLE_CLIENT_ID,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET,
				callbackURL: process.env.GOOGLE_CALLBACK_URL,
				scope: ['profile', 'email'],
			},
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			async (_accessToken: string, _refreshToken: string, profile: any, done: (err: Error | null, user?: any) => void) => {
				const session = await mongoose.startSession();
				session.startTransaction();

				try {
					const googleId = profile.id;
					const email = profile.emails?.[0]?.value;

					if (!email) {
						await session.abortTransaction();
						return done(new Error('No email returned from Google - ensure email scope is granted'));
					}

					const byGoogleId = await UserAuth.findOne({ googleId }).populate('user').session(session);
					if (byGoogleId?.user) {
						await session.abortTransaction();
						logger.info('Google sign-in by googleId', { googleId });
						return done(null, byGoogleId.user as unknown as Express.User);
					}

					const { user, created } = await findOrCreateUserByEmail(email, session);
					const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);

					if (existingAuth) {
						if (existingAuth.googleId && existingAuth.googleId !== googleId) {
							await session.abortTransaction();
							return done(new Error('Google account conflict: this email is already linked to a different Google account'));
						}

						if (!existingAuth.googleId) {
							existingAuth.googleId = googleId;
							await existingAuth.save({ session });
							logger.info('Linked googleId to existing user', { userId: user._id });
						}
					} else {
						await UserAuth.create([{ user: user._id, googleId }], { session });
					}

					await session.commitTransaction();
					logger.info(created ? 'Google sign-up: new user created' : 'Google sign-in by email', {
						userId: user._id,
					});
					return done(null, user as Express.User);
				} catch (error) {
					await session.abortTransaction();
					logger.error('Google strategy error', { error });
					return done(error as Error);
				} finally {
					await session.endSession();
				}
			}
		)
	);
} else {
	logger.warn('Google OAuth strategy not registered - missing environment variables');
}

const APPLE_PLACEHOLDER_EMAIL_PREFIX = 'apple-';
const APPLE_PLACEHOLDER_EMAIL_SUFFIX = '@users.noreply.local';

function getApplePlaceholderEmail(appleId: string): string {
	return `${APPLE_PLACEHOLDER_EMAIL_PREFIX}${appleId}${APPLE_PLACEHOLDER_EMAIL_SUFFIX}`;
}

export function isApplePlaceholderEmail(email: string): boolean {
	return email.startsWith(APPLE_PLACEHOLDER_EMAIL_PREFIX) && email.endsWith(APPLE_PLACEHOLDER_EMAIL_SUFFIX);
}

interface DecodedAppleIdToken {
	sub?: string;
	email?: string;
}

function decodeAppleIdToken(idToken: string): DecodedAppleIdToken {
	const decoded = jwt.decode(idToken);
	if (!decoded || typeof decoded === 'string') return {};
	return decoded as DecodedAppleIdToken;
}

function normalizeApplePrivateKey(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.includes('-----BEGIN')) return trimmed;
	return `-----BEGIN PRIVATE KEY-----\n${trimmed}\n-----END PRIVATE KEY-----`;
}

if (
	process.env.APPLE_CLIENT_ID &&
	process.env.APPLE_TEAM_ID &&
	process.env.APPLE_KEY_ID &&
	process.env.APPLE_PRIVATE_KEY &&
	process.env.APPLE_CALLBACK_URL
) {
	passport.use(
		new AppleStrategy(
			{
				clientID: process.env.APPLE_CLIENT_ID,
				teamID: process.env.APPLE_TEAM_ID,
				keyID: process.env.APPLE_KEY_ID,
				privateKeyString: normalizeApplePrivateKey(process.env.APPLE_PRIVATE_KEY),
				callbackURL: process.env.APPLE_CALLBACK_URL,
				responseType: 'code id_token',
				scope: ['name', 'email'],
				passReqToCallback: false,
			} as never,
			(async (
				_accessToken: string,
				_refreshToken: string,
				idToken: string,
				profile: { id?: string; email?: string } | undefined,
				done: (err: Error | null, user?: unknown) => void
			) => {
				const session = await mongoose.startSession();
				session.startTransaction();

				try {
					if (!idToken) {
						await session.abortTransaction();
						return done(new Error('Apple token exchange did not return an id_token'));
					}

					const decoded = decodeAppleIdToken(idToken);
					const appleId = profile?.id ?? decoded.sub;
					if (!appleId) {
						await session.abortTransaction();
						return done(new Error('Apple sign-in did not include a stable user identifier'));
					}

					const byAppleId = await UserAuth.findOne({ appleId }).populate('user').session(session);
					if (byAppleId?.user) {
						await session.abortTransaction();
						logger.info('Apple sign-in by appleId', { appleId });
						return done(null, byAppleId.user as unknown as Express.User);
					}

					const email = profile?.email ?? decoded.email ?? '';
					const effectiveEmail = email || getApplePlaceholderEmail(appleId);
					const { user, created } = await findOrCreateUserByEmail(effectiveEmail, session);
					const existingAuth = await UserAuth.findOne({ user: user._id }).session(session);

					if (existingAuth) {
						if (existingAuth.appleId && existingAuth.appleId !== appleId) {
							await session.abortTransaction();
							return done(new Error('Apple account conflict: this email is already linked to a different Apple account'));
						}

						if (!existingAuth.appleId) {
							existingAuth.appleId = appleId;
							await existingAuth.save({ session });
							logger.info('Linked appleId to existing user', { userId: user._id });
						}
					} else {
						await UserAuth.create([{ user: user._id, appleId }], { session });
					}

					await session.commitTransaction();
					logger.info(created ? 'Apple sign-up: new user created' : 'Apple sign-in by email', {
						userId: user._id,
						usedPlaceholder: !email,
					});
					return done(null, user as Express.User);
				} catch (error) {
					await session.abortTransaction();
					logger.error('Apple strategy error', { error });
					return done(error as Error);
				} finally {
					await session.endSession();
				}
			}) as unknown as (...args: unknown[]) => void
		)
	);
} else {
	logger.warn('Apple OAuth strategy not registered - missing environment variables');
}

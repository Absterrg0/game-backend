import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { betterAuth, getAuthTables, type BetterAuthOptions } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import User, { type UserDocument } from '../models/User';
import { cookieSameSite, isProd } from './config';
import { logger } from './logger';

const APPLE_PLACEHOLDER_EMAIL_PREFIX = 'apple-';
const APPLE_PLACEHOLDER_EMAIL_SUFFIX = '@users.noreply.local';

interface AuthUserLike {
	id: string;
	email: string;
	name?: string | null;
	appUserId?: string | null;
}

export interface AuthSessionLike {
	user: AuthUserLike;
	session: {
		id: string;
		userId: string;
		expiresAt: Date;
	};
}

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new Error(`${name} environment variable is required`);
	}
	return value;
}

function getBetterAuthBaseURL(): string {
	return process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 4000}`;
}

function getBetterAuthSecret(): string {
	return (
		process.env.BETTER_AUTH_SECRET ||
		process.env.SESSION_SECRET ||
		process.env.JWT_SECRET ||
		requireEnv('BETTER_AUTH_SECRET')
	);
}

function normalizeApplePrivateKey(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.includes('-----BEGIN')) return trimmed;
	return `-----BEGIN PRIVATE KEY-----\n${trimmed}\n-----END PRIVATE KEY-----`;
}

function buildAppleClientSecret(): string {
	const clientId = requireEnv('APPLE_CLIENT_ID');
	const teamId = requireEnv('APPLE_TEAM_ID');
	const keyId = requireEnv('APPLE_KEY_ID');
	const privateKey = normalizeApplePrivateKey(requireEnv('APPLE_PRIVATE_KEY'));

	return jwt.sign({}, privateKey, {
		algorithm: 'ES256',
		issuer: teamId,
		audience: 'https://appleid.apple.com',
		subject: clientId,
		expiresIn: '180d',
		header: { alg: 'ES256', kid: keyId },
	});
}

export function getApplePlaceholderEmail(appleId: string): string {
	return `${APPLE_PLACEHOLDER_EMAIL_PREFIX}${appleId}${APPLE_PLACEHOLDER_EMAIL_SUFFIX}`;
}

export function isApplePlaceholderEmail(email: string): boolean {
	return email.startsWith(APPLE_PLACEHOLDER_EMAIL_PREFIX) && email.endsWith(APPLE_PLACEHOLDER_EMAIL_SUFFIX);
}

function buildAppleUserInfo(token: {
	idToken?: string;
	user?: {
		name?: {
			firstName?: string;
			lastName?: string;
		};
		email?: string;
	};
}): {
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: boolean;
	};
	data: Record<string, unknown>;
} | null {
	if (!token.idToken) return null;

	const decoded = jwt.decode(token.idToken);
	if (!decoded || typeof decoded !== 'object') return null;

	const sub = typeof decoded.sub === 'string' ? decoded.sub : null;
	if (!sub) return null;

	const emailFromToken = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
	const email = emailFromToken || getApplePlaceholderEmail(sub);
	const emailVerified =
		typeof decoded.email_verified === 'boolean'
			? decoded.email_verified
			: decoded.email_verified === 'true';

	const firstName = token.user?.name?.firstName?.trim() ?? '';
	const lastName = token.user?.name?.lastName?.trim() ?? '';
	const fullName = `${firstName} ${lastName}`.trim();
	const name = fullName || (typeof decoded.name === 'string' ? decoded.name : '');

	return {
		user: {
			id: sub,
			name,
			email,
			emailVerified,
		},
		data: {
			...decoded,
			name,
		},
	};
}

function getConnectedDatabase() {
	const db = mongoose.connection.db;
	if (!db) {
		throw new Error('Database connection must be established before Better Auth is initialized');
	}
	return db;
}

function getAuthOptions(): BetterAuthOptions {
	const socialProviders: NonNullable<BetterAuthOptions['socialProviders']> = {};

	if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
		socialProviders.google = {
			clientId: process.env.GOOGLE_CLIENT_ID,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET,
			prompt: 'select_account',
			redirectURI: 'http://localhost:3000/api/auth/google/callback',
		};
	} else {
		logger.warn('Better Auth Google provider is disabled because credentials are missing');
	}

	if (
		process.env.APPLE_CLIENT_ID &&
		process.env.APPLE_TEAM_ID &&
		process.env.APPLE_KEY_ID &&
		process.env.APPLE_PRIVATE_KEY
	) {
		try {
			socialProviders.apple = {
				clientId: process.env.APPLE_CLIENT_ID,
				clientSecret: buildAppleClientSecret(),
				getUserInfo: async (token) => buildAppleUserInfo(token),
				redirectURI: 'http://localhost:3000/api/auth/apple/callback',
			};
		} catch (error) {
			logger.warn('Better Auth Apple provider is disabled because the Apple credentials are invalid', {
				error,
			});
		}
	} else {
		logger.warn('Better Auth Apple provider is disabled because credentials are missing');
	}

	return {
		baseURL: getBetterAuthBaseURL(),
		secret: getBetterAuthSecret(),
		database: mongodbAdapter(
			getConnectedDatabase() as unknown as Parameters<typeof mongodbAdapter>[0],
			{
				client: mongoose.connection.getClient() as unknown as NonNullable<
					Parameters<typeof mongodbAdapter>[1]
				>['client'],
			},
		),
		trustedOrigins: [process.env.REQUEST_ORIGIN, process.env.CORS_ORIGIN].filter(
			(origin): origin is string => Boolean(origin),
		),
		advanced: {
			useSecureCookies: cookieSameSite === 'none' || isProd,
			defaultCookieAttributes: {
				httpOnly: true,
				secure: cookieSameSite === 'none' || isProd,
				sameSite: cookieSameSite,
				path: '/',
			},
		},
		user: {
			additionalFields: {
				appUserId: {
					type: 'string',
					required: false,
					returned: true,
					input: false,
					index: true,
				},
			},
		},
		account: {
			accountLinking: {
				enabled: true,
				trustedProviders: ['google', 'apple'],
			},
		},
		socialProviders,
		databaseHooks: {
			user: {
				create: {
					before: async (authUser) => {
						const domainUser = await ensureDomainUserLinkForAuthUser({
							id: authUser.id,
							email: authUser.email,
							name: authUser.name,
							appUserId:
								typeof authUser.appUserId === 'string' ? authUser.appUserId : null,
						});

						return {
							data: {
								...authUser,
								appUserId: String(domainUser._id),
							},
						};
					},
				},
			},
		},
		hooks: {
			after: createAuthMiddleware(async (ctx) => {
				if (!ctx.path.startsWith('/callback/')) return;

				const newSession = ctx.context.newSession;
				if (!newSession?.user?.id || !newSession.user.email) return;

				try {
					await ensureDomainUserLinkForAuthUser({
						id: newSession.user.id,
						email: newSession.user.email,
						name: newSession.user.name,
						appUserId:
							typeof newSession.user.appUserId === 'string'
								? newSession.user.appUserId
								: null,
					});
				} catch (error) {
					logger.error('Failed to sync domain user after Better Auth callback', {
						error,
						path: ctx.path,
					});
					throw error;
				}
			}),
		},
	};
}

let authInstance: ReturnType<typeof betterAuth> | null = null;
let authOptionsCache: BetterAuthOptions | null = null;

export function getBetterAuthOptions(): BetterAuthOptions {
	if (!authOptionsCache) {
		authOptionsCache = getAuthOptions();
	}
	return authOptionsCache;
}

export function getAuth() {
	if (!authInstance) {
		authInstance = betterAuth(getBetterAuthOptions());
	}
	return authInstance;
}

export function getAuthCollectionNames() {
	const tables = getAuthTables(getBetterAuthOptions());
	return {
		user: tables.user.modelName,
		account: tables.account.modelName,
		session: tables.session?.modelName ?? 'session',
	};
}

export async function ensureDomainUserLinkForAuthUser(authUser: AuthUserLike): Promise<UserDocument> {
	const normalizedEmail = authUser.email.trim().toLowerCase();
	let domainUser: UserDocument | null = null;

	if (authUser.appUserId && mongoose.Types.ObjectId.isValid(authUser.appUserId)) {
		domainUser = await User.findById(authUser.appUserId).exec();
	}

	if (!domainUser) {
		domainUser = await User.findOne({ email: normalizedEmail }).exec();
	}

	if (!domainUser) {
		try {
			domainUser = await User.create({
				email: normalizedEmail,
			});
		} catch (error) {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				(error as { code?: number }).code === 11000
			) {
				domainUser = await User.findOne({ email: normalizedEmail }).exec();
			} else {
				throw error;
			}
		}
	}

	if (!domainUser) {
		throw new Error(`Unable to resolve domain user for auth user ${authUser.id}`);
	}

	if (authUser.appUserId !== String(domainUser._id)) {
		const db = getConnectedDatabase();
		const { user: authUserCollectionName } = getAuthCollectionNames();
		await db.collection(authUserCollectionName).updateOne(
			{ id: authUser.id },
			{ $set: { appUserId: String(domainUser._id) } },
		);
	}

	return domainUser;
}

export async function getAuthSession(req: Request): Promise<AuthSessionLike | null> {
	const session = await getAuth().api.getSession({
		headers: fromNodeHeaders(req.headers),
	});

	if (!session || !session.user || !session.session) {
		return null;
	}

	return session as AuthSessionLike;
}

export async function getDomainUserFromAuthSession(authSession: AuthSessionLike): Promise<UserDocument | null> {
	if (authSession.user.appUserId && mongoose.Types.ObjectId.isValid(authSession.user.appUserId)) {
		const user = await User.findById(authSession.user.appUserId)
			.select('_id email name alias dateOfBirth gender role adminOf organizerOf')
			.exec();
		if (user) return user;
	}

	const linkedUser = await ensureDomainUserLinkForAuthUser(authSession.user);
	return User.findById(linkedUser._id)
		.select('_id email name alias dateOfBirth gender role adminOf organizerOf')
		.exec();
}

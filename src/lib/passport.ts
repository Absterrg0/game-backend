/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as AppleStrategy, type VerifyCallback } from 'passport-apple';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import UserAuth from '../models/UserAuth';

// Google OAuth Strategy - uses UserAuth for provider IDs (only register if configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALLBACK_URL) {
	passport.use(
		new GoogleStrategy(
		{
			clientID: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
			scope: ['profile', 'email']
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async (accessToken: string, refreshToken: string, profile: any, done: Function) => {
			try {
				const { id, emails } = profile;
				const email = emails?.[0]?.value;

				if (!email) {
					return done(new Error('No email found in Google profile'), undefined);
				}

				let userAuth = await UserAuth.findOne({ googleId: id }).populate('user');
				if (userAuth?.user) {
					return done(null, userAuth.user);
				}

				// Check if user exists by email (e.g. signed up with Apple first)
				const existingUser = await User.findOne({ email });
				if (existingUser) {
					userAuth = await UserAuth.findOne({ user: existingUser._id });
					if (userAuth) {
						userAuth.googleId = id;
						await userAuth.save();
					} else {
						userAuth = new UserAuth({
							user: existingUser._id,
							googleId: id
						});
						await userAuth.save();
					}
					return done(null, existingUser);
				}

				// New user: create User and UserAuth
				const newUser = new User({ email });
				await newUser.save();

				userAuth = new UserAuth({
					user: newUser._id,
					googleId: id
				});
				await userAuth.save();

				done(null, newUser);
			} catch (error) {
				done(error as Error, undefined);
			}
		}
	)
	);
}

// Apple OAuth Strategy (only register if configured)
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
			clientID: process.env.APPLE_CLIENT_ID as string,
			teamID: process.env.APPLE_TEAM_ID as string,
			keyID: process.env.APPLE_KEY_ID as string,
			privateKeyString: `-----BEGIN PRIVATE KEY-----\n${process.env.APPLE_PRIVATE_KEY as string}\n-----END PRIVATE KEY-----`,
			callbackURL: process.env.APPLE_CALLBACK_URL as string,
			responseType: 'code id_token',
			scope: ['name', 'email'],
			passReqToCallback: false
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		async (accessToken: string, refreshToken: string, idToken: string, profile: any, done: VerifyCallback) => {
			try {
				const decoded = jwt.decode(idToken) as {
					sub: string;
					email?: string;
					email_verified?: boolean;
					name?: { firstName?: string; lastName?: string };
				} | null;
				if (!decoded) {
					return done(new Error('Unable to decode Apple ID token'), undefined);
				}
				const { sub, email } = decoded;
				const appleEmail = profile?.email ?? email;

				let userAuth = await UserAuth.findOne({ appleId: sub }).populate('user');
				if (userAuth?.user) {
					return done(null, userAuth.user);
				}

				// Check if user exists by email (e.g. signed up with Google first)
				const effectiveEmail = appleEmail || `apple_${sub}@placeholder.local`;
				const existingUser = effectiveEmail && !effectiveEmail.includes('@placeholder.local')
					? await User.findOne({ email: effectiveEmail })
					: null;
				if (existingUser) {
					userAuth = await UserAuth.findOne({ user: existingUser._id });
					if (userAuth) {
						userAuth.appleId = sub;
						await userAuth.save();
					} else {
						userAuth = new UserAuth({
							user: existingUser._id,
							appleId: sub
						});
						await userAuth.save();
					}
					return done(null, existingUser);
				}

				// New user: create User and UserAuth (Apple may not provide email on first callback)
				const newUser = new User({
					email: effectiveEmail
				});
				await newUser.save();

				userAuth = new UserAuth({
					user: newUser._id,
					appleId: sub
				});
				await userAuth.save();

				done(null, newUser);
			} catch (error) {
				done(error as Error, undefined);
			}
		}
	)
	);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
passport.serializeUser((user: any, done: Function) => {
	done(null, user._id);
});

passport.deserializeUser(async (id: string, done: Function) => {
	try {
		const user = await User.findById(id);
		done(null, user);
	} catch (error) {
		done(error as Error, undefined);
	}
});

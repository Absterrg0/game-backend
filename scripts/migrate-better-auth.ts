import 'dotenv/config';
import mongoose from 'mongoose';
import { generateId } from 'better-auth';
import { connectToDatabase } from '../src/lib/db';
import { getAuthCollectionNames } from '../src/lib/auth';
import User from '../src/models/User';

interface LegacyUserAuthRecord {
	user: mongoose.Types.ObjectId;
	googleId?: string | null;
	appleId?: string | null;
	createdAt?: Date;
	updatedAt?: Date;
}

interface BetterAuthUserRecord {
	id: string;
	email: string;
	emailVerified: boolean;
	name: string;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
	appUserId: string;
}

function getDisplayName(user: {
	name?: string | null;
	alias?: string | null;
	email: string;
}): string {
	if (user.name?.trim()) return user.name.trim();
	if (user.alias?.trim()) return user.alias.trim();
	return user.email.split('@')[0] ?? 'Player';
}

async function ensureBetterAuthUser(
	authUsers: mongoose.mongo.Collection<BetterAuthUserRecord>,
	domainUser: {
		_id: mongoose.Types.ObjectId;
		email: string;
		name?: string | null;
		alias?: string | null;
		createdAt?: Date;
		updatedAt?: Date;
	},
): Promise<BetterAuthUserRecord> {
	const appUserId = String(domainUser._id);
	const existingByAppUser = await authUsers.findOne({ appUserId });
	if (existingByAppUser) {
		if (existingByAppUser.email !== domainUser.email || !existingByAppUser.appUserId) {
			await authUsers.updateOne(
				{ id: existingByAppUser.id },
				{
					$set: {
						email: domainUser.email,
						appUserId,
						name: getDisplayName(domainUser),
						updatedAt: new Date(),
					},
				},
			);
			return {
				...existingByAppUser,
				email: domainUser.email,
				appUserId,
				name: getDisplayName(domainUser),
				updatedAt: new Date(),
			};
		}
		return existingByAppUser;
	}

	const existingByEmail = await authUsers.findOne({ email: domainUser.email });
	if (existingByEmail) {
		await authUsers.updateOne(
			{ id: existingByEmail.id },
			{
				$set: {
					appUserId,
					name: getDisplayName(domainUser),
					updatedAt: new Date(),
				},
			},
		);
		return {
			...existingByEmail,
			appUserId,
			name: getDisplayName(domainUser),
			updatedAt: new Date(),
		};
	}

	const record: BetterAuthUserRecord = {
		id: generateId(),
		email: domainUser.email,
		emailVerified: true,
		name: getDisplayName(domainUser),
		image: null,
		createdAt: domainUser.createdAt ?? new Date(),
		updatedAt: domainUser.updatedAt ?? new Date(),
		appUserId,
	};
	await authUsers.insertOne(record);
	return record;
}

async function ensureProviderAccount(
	authAccounts: mongoose.mongo.Collection,
	authUserId: string,
	providerId: 'google' | 'apple',
	accountId: string,
	timestamp: Date,
) {
	const existing = await authAccounts.findOne({ providerId, accountId });
	if (existing) {
		if (existing.userId !== authUserId) {
			throw new Error(
				`Legacy ${providerId} account ${accountId} is already linked to Better Auth user ${existing.userId}`,
			);
		}
		return false;
	}

	await authAccounts.insertOne({
		id: generateId(),
		accountId,
		providerId,
		userId: authUserId,
		createdAt: timestamp,
		updatedAt: timestamp,
	});
	return true;
}

async function main() {
	await connectToDatabase();
	const db = mongoose.connection.db;
	if (!db) throw new Error('Database connection not ready');

	const authCollections = getAuthCollectionNames();
	const legacyUserAuths = db.collection<LegacyUserAuthRecord>('userauths');
	const authUsers = db.collection<BetterAuthUserRecord>(authCollections.user);
	const authAccounts = db.collection(authCollections.account);

	const records = await legacyUserAuths
		.find({
			$or: [
				{ googleId: { $exists: true, $ne: null } },
				{ appleId: { $exists: true, $ne: null } },
			],
		})
		.toArray();

	let migratedUsers = 0;
	let migratedAccounts = 0;

	for (const record of records) {
		const domainUser = await User.findById(record.user)
			.select('_id email name alias createdAt updatedAt')
			.setOptions({ includeDeleted: true })
			.lean()
			.exec();
		if (!domainUser) {
			console.warn(`Skipping legacy auth record for missing user ${String(record.user)}`);
			continue;
		}

		const authUser = await ensureBetterAuthUser(authUsers, domainUser);
		migratedUsers += 1;

		const timestamp = record.updatedAt ?? record.createdAt ?? new Date();
		if (record.googleId) {
			const created = await ensureProviderAccount(
				authAccounts,
				authUser.id,
				'google',
				record.googleId,
				timestamp,
			);
			if (created) migratedAccounts += 1;
		}

		if (record.appleId) {
			const created = await ensureProviderAccount(
				authAccounts,
				authUser.id,
				'apple',
				record.appleId,
				timestamp,
			);
			if (created) migratedAccounts += 1;
		}
	}

	console.log(
		`Better Auth migration complete: processed ${records.length} legacy links, touched ${migratedUsers} auth users, created ${migratedAccounts} provider accounts.`,
	);
}

main()
	.catch((error) => {
		console.error('Failed to migrate legacy Passport auth data to Better Auth', error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await mongoose.disconnect();
	});

import 'dotenv/config';
import { connectToDatabase } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import User from '../src/models/User';
import Club from '../src/models/Club';
import Tournament from '../src/models/Tournament';
import Sponsor from '../src/models/Sponsor';
import {
	getAssetsConfig,
	assertAssetsConfigured,
	bufferFromDataUrl,
	uploadBufferToAssets,
	type AssetKind,
} from '../src/lib/assets';

function isDataUrl(value: unknown): value is string {
	return typeof value === 'string' && value.trim().startsWith('data:image/');
}

type MigrateStats = { ok: number; failed: number; total: number };

async function migrateOne(params: {
	kind: AssetKind;
	label: string;
	id: string;
	value: string;
	dryRun: boolean;
	setUrl: (url: string) => Promise<void>;
	config: ReturnType<typeof getAssetsConfig>;
	stats: MigrateStats;
}): Promise<void> {
	params.stats.total += 1;
	try {
		if (params.dryRun) {
			logger.info(`[dry-run] would migrate ${params.label} (${params.kind})`);
			params.stats.ok += 1;
			return;
		}

		const parsed = bufferFromDataUrl(params.value);
		if (!parsed) {
			throw new Error('Invalid data URL');
		}

		const uploaded = await uploadBufferToAssets({
			buffer: parsed.buffer,
			contentType: parsed.contentType,
			kind: params.kind,
			assetId: params.id,
			config: params.config,
		});
		await params.setUrl(uploaded.publicUrl);
		params.stats.ok += 1;
		logger.info(`Migrated ${params.label} → ${uploaded.publicUrl}`);
	} catch (err) {
		params.stats.failed += 1;
		logger.error(`Failed migrating ${params.label}`, { err });
	}
}

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const config = assertAssetsConfigured(getAssetsConfig());

	logger.info('Starting base64 → S3 image migration (cursor streaming, no sharp)', {
		dryRun,
		prefix: config.prefix,
		bucket: config.bucket,
	});

	await connectToDatabase();
	const stats: MigrateStats = { ok: 0, failed: 0, total: 0 };

	const userCursor = User.find({ profilePictureUrl: { $regex: /^data:image\// } })
		.select('_id profilePictureUrl')
		.lean()
		.cursor({ batchSize: 50 });
	for await (const user of userCursor) {
		if (!isDataUrl(user.profilePictureUrl)) continue;
		await migrateOne({
			kind: 'user_avatar',
			label: `user:${user._id.toString()}`,
			id: user._id.toString(),
			value: user.profilePictureUrl,
			dryRun,
			config,
			stats,
			setUrl: async (url) => {
				await User.updateOne({ _id: user._id }, { $set: { profilePictureUrl: url } });
			},
		});
	}

	const clubCursor = Club.find({ logoUrl: { $regex: /^data:image\// } })
		.select('_id logoUrl')
		.lean()
		.cursor({ batchSize: 50 });
	for await (const club of clubCursor) {
		if (!isDataUrl(club.logoUrl)) continue;
		await migrateOne({
			kind: 'club_logo',
			label: `club:${club._id.toString()}`,
			id: club._id.toString(),
			value: club.logoUrl,
			dryRun,
			config,
			stats,
			setUrl: async (url) => {
				await Club.updateOne({ _id: club._id }, { $set: { logoUrl: url } });
			},
		});
	}

	const tournamentCursor = Tournament.find({ logoUrl: { $regex: /^data:image\// } })
		.select('_id logoUrl')
		.lean()
		.cursor({ batchSize: 50 });
	for await (const tournament of tournamentCursor) {
		if (!isDataUrl(tournament.logoUrl)) continue;
		await migrateOne({
			kind: 'tournament_logo',
			label: `tournament:${tournament._id.toString()}`,
			id: tournament._id.toString(),
			value: tournament.logoUrl,
			dryRun,
			config,
			stats,
			setUrl: async (url) => {
				await Tournament.updateOne({ _id: tournament._id }, { $set: { logoUrl: url } });
			},
		});
	}

	const sponsorCursor = Sponsor.find({ logoUrl: { $regex: /^data:image\// } })
		.select('_id logoUrl')
		.lean()
		.cursor({ batchSize: 50 });
	for await (const sponsor of sponsorCursor) {
		if (!isDataUrl(sponsor.logoUrl)) continue;
		await migrateOne({
			kind: 'sponsor_logo',
			label: `sponsor:${sponsor._id.toString()}`,
			id: sponsor._id.toString(),
			value: sponsor.logoUrl,
			dryRun,
			config,
			stats,
			setUrl: async (url) => {
				await Sponsor.updateOne({ _id: sponsor._id }, { $set: { logoUrl: url } });
			},
		});
	}

	logger.info('Migration finished', stats);
	if (stats.failed > 0) process.exitCode = 1;
	process.exit();
}

main().catch((err) => {
	const message = err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error ? err.stack : undefined;
	logger.error('Migration crashed', { message, stack, err });
	process.exit(1);
});

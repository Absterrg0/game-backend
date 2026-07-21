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

type MigrationTarget = {
	kind: AssetKind;
	label: string;
	id: string;
	value: string;
	setUrl: (url: string) => Promise<void>;
};

function isDataUrl(value: unknown): value is string {
	return typeof value === 'string' && value.trim().startsWith('data:image/');
}

async function collectTargets(): Promise<MigrationTarget[]> {
	const targets: MigrationTarget[] = [];

	const users = await User.find({ profilePictureUrl: { $regex: /^data:image\// } })
		.select('_id profilePictureUrl')
		.lean();
	for (const user of users) {
		if (!isDataUrl(user.profilePictureUrl)) continue;
		targets.push({
			kind: 'user_avatar',
			label: `user:${user._id.toString()}`,
			id: user._id.toString(),
			value: user.profilePictureUrl,
			setUrl: async (url) => {
				await User.updateOne({ _id: user._id }, { $set: { profilePictureUrl: url } });
			},
		});
	}

	const clubs = await Club.find({ logoUrl: { $regex: /^data:image\// } })
		.select('_id logoUrl')
		.lean();
	for (const club of clubs) {
		if (!isDataUrl(club.logoUrl)) continue;
		targets.push({
			kind: 'club_logo',
			label: `club:${club._id.toString()}`,
			id: club._id.toString(),
			value: club.logoUrl,
			setUrl: async (url) => {
				await Club.updateOne({ _id: club._id }, { $set: { logoUrl: url } });
			},
		});
	}

	const tournaments = await Tournament.find({ logoUrl: { $regex: /^data:image\// } })
		.select('_id logoUrl')
		.lean();
	for (const tournament of tournaments) {
		if (!isDataUrl(tournament.logoUrl)) continue;
		targets.push({
			kind: 'tournament_logo',
			label: `tournament:${tournament._id.toString()}`,
			id: tournament._id.toString(),
			value: tournament.logoUrl,
			setUrl: async (url) => {
				await Tournament.updateOne({ _id: tournament._id }, { $set: { logoUrl: url } });
			},
		});
	}

	const sponsors = await Sponsor.find({ logoUrl: { $regex: /^data:image\// } })
		.select('_id logoUrl')
		.lean();
	for (const sponsor of sponsors) {
		if (!isDataUrl(sponsor.logoUrl)) continue;
		targets.push({
			kind: 'sponsor_logo',
			label: `sponsor:${sponsor._id.toString()}`,
			id: sponsor._id.toString(),
			value: sponsor.logoUrl,
			setUrl: async (url) => {
				await Sponsor.updateOne({ _id: sponsor._id }, { $set: { logoUrl: url } });
			},
		});
	}

	return targets;
}

async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const config = assertAssetsConfigured(getAssetsConfig());

	logger.info('Starting base64 → S3 image migration (direct put, no sharp)', {
		dryRun,
		prefix: config.prefix,
		bucket: config.bucket,
	});

	await connectToDatabase();
	const targets = await collectTargets();
	logger.info(`Found ${targets.length} base64 image field(s)`);

	let ok = 0;
	let failed = 0;

	for (const target of targets) {
		try {
			if (dryRun) {
				logger.info(`[dry-run] would migrate ${target.label} (${target.kind})`);
				ok += 1;
				continue;
			}

			const parsed = bufferFromDataUrl(target.value);
			if (!parsed) {
				throw new Error('Invalid data URL');
			}

			const uploaded = await uploadBufferToAssets({
				buffer: parsed.buffer,
				contentType: parsed.contentType,
				kind: target.kind,
				assetId: target.id,
				config,
			});
			await target.setUrl(uploaded.publicUrl);
			ok += 1;
			logger.info(`Migrated ${target.label} → ${uploaded.publicUrl}`);
		} catch (err) {
			failed += 1;
			logger.error(`Failed migrating ${target.label}`, { err });
		}
	}

	logger.info('Migration finished', { ok, failed, total: targets.length });
	if (failed > 0) process.exitCode = 1;
	process.exit();
}

main().catch((err) => {
	const message = err instanceof Error ? err.message : String(err);
	const stack = err instanceof Error ? err.stack : undefined;
	logger.error('Migration crashed', { message, stack, err });
	process.exit(1);
});

import 'dotenv/config';
import { connectToDatabase } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import User from '../src/models/User';
import Club from '../src/models/Club';
import Tournament from '../src/models/Tournament';
import Sponsor from '../src/models/Sponsor';
import {
	assertAssetsConfigured,
	deleteObjectKeys,
	getAssetsConfig,
	listObjectKeysUnderPrefix,
	objectKeyFromCdnUrl,
} from '../src/lib/assets';

async function collectReferencedKeys(prefix: string): Promise<Set<string>> {
	const referenced = new Set<string>();

	const addUrl = (url: unknown) => {
		if (typeof url !== 'string' || !url.trim()) return;
		const key = objectKeyFromCdnUrl(url);
		if (!key || !key.startsWith(prefix)) return;
		referenced.add(key);
	};

	const [users, clubs, tournaments, sponsors] = await Promise.all([
		User.find({ profilePictureUrl: { $type: 'string' } }).select('profilePictureUrl').lean(),
		Club.find({ logoUrl: { $type: 'string' } }).select('logoUrl').lean(),
		Tournament.find({ logoUrl: { $type: 'string' } }).select('logoUrl').lean(),
		Sponsor.find({ logoUrl: { $type: 'string' } }).select('logoUrl').lean(),
	]);

	for (const user of users) addUrl(user.profilePictureUrl);
	for (const club of clubs) addUrl(club.logoUrl);
	for (const tournament of tournaments) addUrl(tournament.logoUrl);
	for (const sponsor of sponsors) addUrl(sponsor.logoUrl);

	return referenced;
}

async function main() {
	const dryRun = !process.argv.includes('--execute');
	const config = assertAssetsConfigured(getAssetsConfig());
	const prefix = `${config.prefix}/`;

	logger.info('Starting orphan asset cleanup', {
		dryRun,
		prefix: config.prefix,
		bucket: config.bucket,
		hint: dryRun ? 'Pass --execute to delete' : 'Deleting unreferenced keys',
	});

	await connectToDatabase();
	const [objectKeys, referenced] = await Promise.all([
		listObjectKeysUnderPrefix(prefix, config),
		collectReferencedKeys(prefix),
	]);

	const orphans = objectKeys.filter((key) => !referenced.has(key));
	logger.info('Orphan scan complete', {
		listed: objectKeys.length,
		referenced: referenced.size,
		orphans: orphans.length,
	});

	if (orphans.length === 0) {
		logger.info('Nothing to delete');
		process.exit(0);
	}

	if (dryRun) {
		for (const key of orphans.slice(0, 50)) {
			logger.info(`[dry-run] would delete ${key}`);
		}
		if (orphans.length > 50) {
			logger.info(`[dry-run] …and ${orphans.length - 50} more`);
		}
		process.exit(0);
	}

	await deleteObjectKeys(orphans, config);
	logger.info(`Deleted ${orphans.length} orphan object(s)`);
	process.exit(0);
}

main().catch((err) => {
	logger.error('Cleanup crashed', { err });
	process.exit(1);
});

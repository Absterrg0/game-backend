import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connectToDatabase } from './lib/db';
import { logger } from './lib/logger';
import './lib/passport';
import passport from 'passport';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import clubRoutes from './routes/club.routes';
import tournamentRoutes from './routes/tournament.routes';
import sponsorRoutes from './routes/sponsor.routes';
import scheduleRoutes from './routes/schedule.routes';
import playersRoutes from './routes/players.routes';
import uploadsRoutes from './routes/uploads.routes';
import { resolveCommitSha } from './lib/commitSha';
import { getAssetsConfig } from './lib/assets';

const PORT = process.env.PORT || 4000;
const REQUEST_ORIGIN = process.env.REQUEST_ORIGIN?.trim();
const CORS_ORIGIN = process.env.CORS_ORIGIN?.trim();
const COMMIT_SHA = resolveCommitSha();

const app = express();
app.set('trust proxy', 1);

const configuredOrigins = [CORS_ORIGIN, REQUEST_ORIGIN]
	.flatMap((value) => value?.split(',') ?? [])
	.map((value) => value.trim())
	.filter(Boolean);

const allowedOrigins = new Set([
	...configuredOrigins,
	// Apple Sign-In uses a form POST from appleid.apple.com; the browser sends that as Origin
	'https://appleid.apple.com',
]);

if (configuredOrigins.length === 0) {
	throw new Error('CORS_ORIGIN or REQUEST_ORIGIN must be set for authenticated requests');
}

app.use(
	cors({
		origin(origin, callback) {
			if (!origin || allowedOrigins.has(origin)) {
				return callback(null, true);
			}

			return callback(new Error('CORS origin not allowed'));
		},
		credentials: true
	})
);

// Gzip JSON responses (large list payloads shrink ~5-10x). Skips small bodies automatically.
app.use(compression());

// Prefer CDN URLs from /api/uploads/presign; keep a higher JSON limit while legacy base64 may remain.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
	res.send('Hello World');
});

app.get('/api/version', (req, res) => {
	res.json({ sha: COMMIT_SHA });
});

async function start() {
	try {
		const assetsConfig = getAssetsConfig();
		logger.info('Asset storage config', {
			enabled: assetsConfig.enabled,
			bucket: assetsConfig.bucket,
			region: assetsConfig.region,
			prefix: assetsConfig.prefix,
			deployEnv: assetsConfig.deployEnv,
			cdnBaseUrl: assetsConfig.cdnBaseUrl,
		});

		await connectToDatabase();
		logger.info('Database connected');

		app.use(passport.initialize());
		app.use('/api/auth', authRoutes);
		app.use('/api/user', userRoutes);
		app.use('/api/admin', adminRoutes);
		app.use('/api/clubs', clubRoutes);
		app.use('/api/tournaments', tournamentRoutes);
		app.use('/api/schedule', scheduleRoutes);
		app.use('/api/sponsors', sponsorRoutes);
		app.use('/api/players', playersRoutes);
		app.use('/api/uploads', uploadsRoutes);

		app.listen(PORT, () => {
			logger.info(`Server is running on port ${PORT}`);
		});
	} catch (err) {
		logger.error(`Failed to start server: ${err instanceof Error ? err.message : String(err)}`, {
			stack: err instanceof Error ? err.stack : undefined,
		});
		throw err;
	}
}

start().catch((err) => {
	logger.error(`Fatal error during startup: ${err instanceof Error ? err.message : String(err)}`, {
		stack: err instanceof Error ? err.stack : undefined,
	});
	process.exit(1);
});

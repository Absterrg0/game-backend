import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import session from 'express-session';
import { connectToDatabase } from './lib/db';
import { logger } from './lib/logger';
import './lib/passport';
import passport from 'passport';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import clubRoutes from './routes/club.routes';

const PORT = process.env.PORT || 4000;
const OAUTH_SESSION_SECRET = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;

const app = express();
app.set('trust proxy', 1);

if (!OAUTH_SESSION_SECRET) {
	throw new Error('SESSION_SECRET or JWT_SECRET must be set for OAuth');
}

app.use(
	cors({
		origin: true,
		credentials: true
	})
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
	session({
		name: '__oauth_session',
		secret: OAUTH_SESSION_SECRET,
		resave: false,
		saveUninitialized: false,
		proxy: true,
		cookie: {
			httpOnly: true,
			sameSite: 'none',
			secure: 'auto',
			maxAge: 15 * 60 * 1000,
			path: '/',
		},
	})
);

app.get('/', (req, res) => {
	res.send('Hello World');
});

async function start() {
	try {
		await connectToDatabase();
		logger.info('Database connected');

		app.use(passport.initialize());
		app.use('/api/auth', authRoutes);
		app.use('/api/user', userRoutes);
		app.use('/api/admin', adminRoutes);
		app.use('/api/clubs', clubRoutes);

		app.listen(PORT, () => {
			logger.info(`Server is running on port ${PORT}`);
		});
	} catch (err) {
		logger.error('Failed to start server', { err });
		process.exit(1);
	}
}

start();

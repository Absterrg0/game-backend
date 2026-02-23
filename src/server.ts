import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connectToDatabase } from './lib/db';
import './lib/passport';
import passport from 'passport';
import authRoutes from './routes/auth.routes';

const PORT = process.env.PORT || 4000;
const isProd = process.env.NODE_ENV === 'production';

// Cookie sameSite: 'lax' for same-site (localhost, subdomains). Use 'none' for cross-domain prod (requires Secure)
const cookieSameSite = (process.env.COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax';

const app = express();

// CORS - allow all origins for now (restrict in production)
app.use(
	cors({
		origin: true,
		credentials: true
	})
);

app.use(cookieParser());
app.use(express.json());

// Session store - uses MongoDB connection string (avoids mongoose/mongodb version mismatch)
const getSessionStore = () => {
	const mongoUrl = process.env.MONGODB_URI;
	if (!mongoUrl) throw new Error('MONGODB_URI is required for session store');
	return MongoStore.create({
		mongoUrl,
		...(process.env.MONGODB_DB_NAME && { dbName: process.env.MONGODB_DB_NAME }),
		collectionName: 'sessions',
		ttl: 60 * 60 * 24 * 7, // 7 days
		autoRemove: 'native'
	});
};

// Session middleware - must run before passport
app.use(
	session({
		secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
		resave: false,
		saveUninitialized: false,
		store: getSessionStore(),
		name: 'connect.sid',
		cookie: {
			httpOnly: true,
			secure: cookieSameSite === 'none' || isProd,
			sameSite: cookieSameSite,
			maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
			path: '/'
		}
	})
);

app.use(passport.initialize());
app.use(passport.session());

app.get('/', (req, res) => {
	res.send('Hello World');
});

// Auth routes
app.use('/api/auth', authRoutes);

async function start() {
	try {
		await connectToDatabase();
		console.log('Database connected');

		app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	} catch (err) {
		console.error('Failed to start server:', err);
		process.exit(1);
	}
}

start();

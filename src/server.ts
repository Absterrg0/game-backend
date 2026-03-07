import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { toNodeHandler } from 'better-auth/node';
import { connectToDatabase } from './lib/db';
import { logger } from './lib/logger';
import { getAuth } from './lib/auth';
import sessionRoutes from './routes/session.routes';
import userRoutes from './routes/user.routes';
import adminRoutes from './routes/admin.routes';
import clubRoutes from './routes/club.routes';

const PORT = process.env.PORT || 4000;

const app = express();

app.use(
	cors({
		origin: true,
		credentials: true
	})
);

app.use(cookieParser());

app.get('/', (req, res) => {
	res.send('Hello World');
});

async function start() {
	try {
		await connectToDatabase();
		logger.info('Database connected');

		app.all('/api/auth/{*any}', toNodeHandler(getAuth()));
		app.use(express.json());
		app.use(express.urlencoded({ extended: true }));
		app.use('/api/session', sessionRoutes);
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

import type { Request, Response, NextFunction } from 'express';
import User, { type UserDocument } from '../models/User';
import { getAuthSession, getDomainUserFromAuthSession } from '../lib/auth';

export interface IRequest extends Request {
	user: UserDocument;
}

const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
	try {
		const authSession = await getAuthSession(req);
		if (!authSession) {
			res.status(401).json({ message: 'Session expired, login again' });
			return;
		}

		const user = await getDomainUserFromAuthSession(authSession);
		if (!user) {
			res.status(401).json({ message: 'User not found, login again' });
			return;
		}

		(req as IRequest).user = user;
		next();
	} catch (error: unknown) {
		res.status(500).json({ message: 'Authentication error' });
	}
};

export default authenticate;

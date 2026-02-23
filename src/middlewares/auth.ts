import type { Request, Response, NextFunction } from 'express';
import type { IUser } from '../models/User';

export interface IRequest extends Request {
	user?: IUser;
}

const authenticate = async (req: IRequest, res: Response, next: NextFunction) => {

	if (!req.isAuthenticated() || !req.user) {
		return res.status(401).json({ message: 'Not authenticated' });
	}
	req.user = req.user as IUser;
	next();
};

export default authenticate;

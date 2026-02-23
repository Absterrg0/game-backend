import type { Request, Response, NextFunction } from 'express';
import type { IUser } from '../models/User';

export interface IRequest extends Request {
	user?: IUser;
}

const authenticate = async (req: Request, res: Response, next: NextFunction) => {
	if (!req.user) {
		console.log(req);
		return res.status(401).json({ message: 'Not authenticated' });
	}
	(req as IRequest).user = req.user as IUser;
	next();
};

export default authenticate;

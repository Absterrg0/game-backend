/// <reference types="passport" />
import type {} from './passport.d.ts';

import type { UserDocument } from '../models/User';

declare global {
	namespace Express {
		/** req.user and passport callbacks use UserDocument (Mongoose) at runtime. */
		// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Express.User must be an interface for declaration merging
		interface User extends UserDocument {}
	}
}

export {};

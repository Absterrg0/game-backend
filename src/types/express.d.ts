/// <reference types="passport" />
/// <reference path="./passport.d.ts" />

import type { UserDocument } from '../models/User';

declare global {
	namespace Express {
		/** req.user and passport callbacks use UserDocument (Mongoose) at runtime. */
		interface User extends UserDocument {}
	}
}

export {};

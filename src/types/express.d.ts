declare global {
	namespace Express {
		interface User {
			_id: import('mongoose').Types.ObjectId;
			email: string;
			name?: string | null;
			alias?: string | null;
			dateOfBirth?: Date | null;
			gender?: string | null;
			userType?: string;
		}
	}
}

export {};

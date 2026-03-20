import { createUploadthing, type FileRouter } from 'uploadthing/express';
import { UploadThingError } from 'uploadthing/server';

const f = createUploadthing();

export const uploadRouter = {
	sponsorLogoUploader: f({
		image: {
			maxFileSize: '8MB',
			maxFileCount: 1,
		}
	})
		.middleware(async ({ req }) => {
			const user = req.user;

			if (!user) {
				throw new UploadThingError('Unauthorized');
			}

			return {
				userId: user._id.toString(),
				role: user.role,
			};
		})
		.onUploadComplete(async () => {
			return;
		}),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
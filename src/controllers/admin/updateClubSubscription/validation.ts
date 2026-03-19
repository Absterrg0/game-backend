import { z } from 'zod';

export const updateClubSubscriptionSchema = z.object({
	plan: z.enum(['free', 'premium']).optional(),
	expiresAt: z.coerce.date().nullable().optional()
});

export type UpdateClubSubscriptionInput = z.infer<typeof updateClubSubscriptionSchema>;

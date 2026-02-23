import { z } from 'zod';

const emailSchema = z.string().email('Invalid email format').min(1, 'Email is required');

/** Schema for POST /api/auth/complete-signup */
export const completeSignupSchema = z.object({
	email: emailSchema,
	alias: z.string().min(1, 'Alias is required').trim(),
	name: z.string().min(1, 'Name is required').trim(),
	dateOfBirth: z
		.union([z.string(), z.date(), z.null()])
		.optional()
		.nullable()
		.transform((val) => {
			if (val == null || val === '') return null;
			return typeof val === 'string' ? new Date(val) : val;
		}),
	gender: z
		.union([z.enum(['male', 'female', 'other']), z.literal(''), z.null()])
		.optional()
		.transform((val) => (val === '' || val == null ? null : val)),
	appleId: z.string().optional().default('')
});

export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;

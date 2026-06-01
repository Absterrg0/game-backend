import { z } from 'zod';

function normalizeSearchQuery(value: unknown): string {
	if (Array.isArray(value)) {
		return (value[0] ?? '').trim();
	}

	if (typeof value === 'string') {
		return value.trim();
	}

	return '';
}

export const searchUsersQuerySchema = z.object({
	q: z.preprocess(normalizeSearchQuery, z.string()),
});

export type SearchUsersQuery = z.output<typeof searchUsersQuerySchema>;

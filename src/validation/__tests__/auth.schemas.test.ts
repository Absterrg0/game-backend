import { completeSignupSchema, exchangeHandoffSchema } from '../auth.schemas';

describe('completeSignupSchema', () => {
	it('parses required signup fields', () => {
		const result = completeSignupSchema.safeParse({
			pendingToken: 'token-abc',
			alias: 'ace',
			name: 'Alice',
			acceptedTerms: true,
		});
		expect(result.success).toBe(true);
	});

	it('rejects when acceptedTerms is missing or false', () => {
		expect(
			completeSignupSchema.safeParse({
				pendingToken: 'token-abc',
				alias: 'ace',
				name: 'Alice',
			}).success,
		).toBe(false);
		expect(
			completeSignupSchema.safeParse({
				pendingToken: 'token-abc',
				alias: 'ace',
				name: 'Alice',
				acceptedTerms: false,
			}).success,
		).toBe(false);
	});

	it('coerces dateOfBirth string to Date', () => {
		const result = completeSignupSchema.safeParse({
			pendingToken: 'token',
			alias: 'ace',
			name: 'Alice',
			dateOfBirth: '1990-05-15',
			acceptedTerms: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.dateOfBirth).toBeInstanceOf(Date);
		}
	});

	it('maps empty gender to null', () => {
		const result = completeSignupSchema.safeParse({
			pendingToken: 'token',
			alias: 'ace',
			name: 'Alice',
			gender: '',
			acceptedTerms: true,
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.gender).toBeNull();
		}
	});
});

describe('exchangeHandoffSchema', () => {
	it('accepts valid handoff codes', () => {
		expect(
			exchangeHandoffSchema.safeParse({ handoff: 'AbCdEfGhIjKlMnOp' }).success,
		).toBe(true);
	});

	it('rejects short or invalid-format handoff', () => {
		expect(exchangeHandoffSchema.safeParse({ handoff: 'short' }).success).toBe(false);
		expect(exchangeHandoffSchema.safeParse({ handoff: 'has spaces!' }).success).toBe(false);
	});
});

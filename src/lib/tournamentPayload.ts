import mongoose from 'mongoose';

export function toDbPayload(
	data: Record<string, unknown>,
	options?: { status?: string }
): Record<string, unknown> {
	const payload: Record<string, unknown> = { ...data };
	
	if (payload.date != null && payload.date !== '') {
		if (typeof payload.date === 'string') {
			const parsed = new Date(payload.date);
            payload.date = isNaN(parsed.getTime()) ? undefined : parsed;
		}
	} else {
		delete payload.date;
	}
	
	if (payload.club) {
		payload.club = new mongoose.Types.ObjectId(payload.club as string);
	}
	
	if (payload.sponsorId) {
		payload.sponsorId = new mongoose.Types.ObjectId(payload.sponsorId as string);
	} else {
		delete payload.sponsorId;
	}
	
	if (Array.isArray(payload.courts)) {
		payload.courts = (payload.courts as string[]).map(
			(cid) => new mongoose.Types.ObjectId(cid)
		);
	}
	
	if (Array.isArray(payload.roundTimings)) {
		payload.roundTimings = (
			payload.roundTimings as { startDate?: Date | string; endDate?: Date | string }[]
		).map((r) => ({
			startDate: r.startDate ? new Date(r.startDate) : undefined,
			endDate: r.endDate ? new Date(r.endDate) : undefined
		}));
	}
	
	if (options?.status !== undefined) {
		payload.status = options.status;
	} else {
		delete payload.status;
	}
	
	return payload;
}
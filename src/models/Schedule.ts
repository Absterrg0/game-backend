import mongoose, { Schema, type HydratedDocument } from 'mongoose';
import { SCHEDULE_STATUSES, type ScheduleStatus } from '../types/domain/schedule';

export interface IScheduleRound {
	game: mongoose.Types.ObjectId;
	slot: number;
	round: number;
}

export interface ISchedule {
	tournament: mongoose.Types.ObjectId;
	currentRound: number;
	rounds: IScheduleRound[];
	status: ScheduleStatus;
	createdAt: Date;
	updatedAt: Date;
}

export type ScheduleDocument = HydratedDocument<ISchedule>;

const scheduleRoundSchema = new Schema<IScheduleRound>(
	{
		game: {
			type: Schema.Types.ObjectId,
			ref: 'Game',
			required: true
		},
		slot: {
			type: Number,
			required: true,
			min: [1, 'slot must be at least 1']
		},
		round: {
			type: Number,
			required: true,
			min: [1, 'round must be at least 1']
		}
	},
	{ _id: false }
);

const scheduleSchema = new Schema<ISchedule>(
	{
		tournament: {
			type: Schema.Types.ObjectId,
			ref: 'Tournament',
			required: true,
			unique: true
		},
		currentRound: {
			type: Number,
			required: true,
			default: 0,
			min: [0, 'currentRound must be a non-negative number']
		},
		rounds: {
			type: [scheduleRoundSchema],
			default: []
		},
		status: {
			type: String,
			enum: {
				values: SCHEDULE_STATUSES,
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'draft'
		}
	},
	{
		timestamps: true
	}
);

scheduleSchema.index({ tournament: 1 }, { unique: true });
scheduleSchema.index({ status: 1, updatedAt: -1 });

scheduleSchema.pre('validate', function () {
	const usedPairs = new Set<string>();

	for (const entry of this.rounds) {
		const pairKey = `${entry.round}:${entry.slot}`;
		if (usedPairs.has(pairKey)) {
			this.invalidate('rounds', `Duplicate slot ${entry.slot} in round ${entry.round}`);
			break;
		}
		usedPairs.add(pairKey);
	}

	const maxRound = this.rounds.reduce((max, entry) => Math.max(max, entry.round), 0);
	if (this.currentRound > maxRound && maxRound > 0) {
		this.invalidate('currentRound', 'currentRound cannot be greater than the highest round in rounds');
	}
});

const Schedule = mongoose.model<ISchedule>('Schedule', scheduleSchema);

export default Schedule;

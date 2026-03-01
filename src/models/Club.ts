import mongoose, { Schema, type HydratedDocument } from 'mongoose';

export interface IClub {
	name: string;
	address: string;
	coordinates: {
		type: 'Point';
		coordinates: [number, number]; // [longitude, latitude]
	};
	website?: string | null;
	bookingSystemUrl?: string | null;
	status: 'active' | 'archive';
	createdAt: Date;
	updatedAt: Date;
}

export type ClubDocument = HydratedDocument<IClub>;

const clubSchema = new Schema<IClub>(
	{
		name: {
			type: String,
			unique: true,
			required: true
		},
		address: {
			type: String,
			required: true
		},
		coordinates: {
			type: {
				type: String,
				enum: ['Point'],
				required: true,
				default: 'Point'
			},
			coordinates: {
				type: [Number],
				required: true,
				default: [0, 0],
				validate: {
					validator: function (value: number[]) {
						if (!Array.isArray(value) || value.length !== 2) return false;
						const [lon, lat] = value;
						return (
							typeof lon === 'number' &&
							typeof lat === 'number' &&
							lon >= -180 && lon <= 180 &&
							lat >= -90 && lat <= 90
						);
					},
					message:
						'Coordinates must be [longitude, latitude] and within valid ranges.'
				}
			}
		},
		website: {
			type: String,
			default: null
		},
		bookingSystemUrl: {
			type: String,
			default: null
		},
		status: {
			type: String,
			enum: {
				values: ['active', 'archive'],
				message: '{VALUE} is not supported'
			},
			required: true,
			default: 'active'
		}
	},
	{
		timestamps: true,
	}
);

clubSchema.index({ coordinates: '2dsphere' });

const Club = mongoose.model<IClub>('Club', clubSchema);

export default Club;

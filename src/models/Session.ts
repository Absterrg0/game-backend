import mongoose from 'mongoose';

const SESSION_TTL_SECONDS = 604800; // 7 days

const sessionSchema = new mongoose.Schema(
	{
		tokenHash: {
			type: String,
			required: true
		},
		// Legacy docs may have raw JWTs here; newer docs store a hash for index compatibility.
		token: {
			type: String,
			unique: true,
			sparse: true,
			select: false,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true
		},
		expireAt: {
			type: Date,
			default: Date.now,
			expires: SESSION_TTL_SECONDS
		}
	},
	{ collection: 'sessions' }
);

// Sparse unique index: only documents with tokenHash are indexed; legacy docs without tokenHash are ignored.
sessionSchema.index({ tokenHash: 1 }, { unique: true, sparse: true });

const Session = mongoose.model('Session', sessionSchema);
export default Session;

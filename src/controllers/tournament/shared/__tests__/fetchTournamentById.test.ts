import mongoose from 'mongoose';
import Tournament from '../../../../models/Tournament';
import type { TournamentPopulated } from '../../../../types/api/tournament';
import { fetchTournamentById } from '../fetchTournamentById';

jest.mock('../../../../models/Tournament', () => ({
	__esModule: true,
	default: {
		findById: jest.fn(),
	},
}));

const mockTournamentFindById = jest.mocked(Tournament.findById);

function tournamentQuery(value: TournamentPopulated | null) {
	const query = {
		populate: jest.fn(),
		lean: jest.fn(),
		exec: jest.fn<Promise<TournamentPopulated | null>, []>().mockResolvedValue(value),
	};
	query.populate.mockReturnValue(query);
	query.lean.mockReturnValue(query);
	return query;
}

function makeTournament(participantId = new mongoose.Types.ObjectId()): TournamentPopulated {
	return {
		_id: new mongoose.Types.ObjectId(),
		participants: [{ _id: participantId }],
	} as unknown as TournamentPopulated;
}

describe('fetchTournamentById()', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('returns null when the tournament does not exist', async () => {
		mockTournamentFindById.mockReturnValue(tournamentQuery(null) as unknown as ReturnType<typeof Tournament.findById>);

		await expect(fetchTournamentById('missing-id')).resolves.toBeNull();
	});

	it('loads the standard tournament populate graph', async () => {
		const tournament = makeTournament();
		mockTournamentFindById.mockReturnValue(
			tournamentQuery(tournament) as unknown as ReturnType<typeof Tournament.findById>
		);

		await expect(fetchTournamentById('tournament-1')).resolves.toBe(tournament);

		const query = mockTournamentFindById.mock.results[0].value as ReturnType<typeof tournamentQuery>;
		expect(query.populate).toHaveBeenCalledWith({
			path: 'club',
			select: 'name address logoUrl',
			populate: {
				path: 'courts',
				select: 'name type placement',
			},
		});
		expect(query.populate).toHaveBeenCalledWith({
			path: 'schedule',
			select: 'currentRound rounds.round',
		});
		expect(query.populate).toHaveBeenCalledWith('sponsor', 'name logoUrl link');
		expect(query.populate).toHaveBeenCalledWith('participants', 'name alias profilePictureUrl');
	});
});

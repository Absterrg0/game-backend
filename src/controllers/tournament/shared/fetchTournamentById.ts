import Tournament from "../../../models/Tournament";
import type { TournamentPopulated } from "../../../types/api/tournament";

/**
 * Loads a tournament by ID with the standard populate graph for detail-style handlers
 * (club + courts, schedule summary, sponsor, participants).
 */
export async function fetchTournamentById(
  id: string,
): Promise<TournamentPopulated | null> {
  return Tournament.findById(id)
    .populate({
      path: "club",
      select: "name address logoUrl",
      populate: {
        path: "courts",
        select: "name type placement",
      },
    })
    .populate({
      path: "schedule",
      select: "currentRound rounds.round",
    })
    .populate("sponsor", "name logoUrl link")
    .populate("participants", "name alias profilePictureUrl")
    .lean<TournamentPopulated>()
    .exec();
}

import mongoose from "mongoose";
import Tournament from "../../../models/Tournament";
import type { AuthenticatedSession } from "../../../shared";
import { error, ok } from "../../../shared/helpers";

/**
 * Atomically removes the user from tournament participants.
 */
export async function leaveTournamentFlow(
  tournamentId: string,
  session: AuthenticatedSession
) {
  const returnedDoc = await Tournament.findByIdAndUpdate(
    tournamentId,
    { $pull: { participants: session._id } },
    { new: true }
  )
    .select("participants maxMember")
    .lean()
    .exec();

  if (!returnedDoc) {
    return error(404, "Tournament not found");
  }

  const spotsFilled = (returnedDoc.participants ?? []).length;
  const spotsTotal = Math.max(1, returnedDoc.maxMember ?? 1);
  const isParticipant = (returnedDoc.participants ?? []).some(
    (pid: mongoose.Types.ObjectId) => pid.toString() === session._id.toString()
  );

  return ok(
    {
      tournamentId,
      spotsFilled,
      spotsTotal,
      isParticipant,
    },
    { status: 200, message: "Successfully left tournament" }
  );
}

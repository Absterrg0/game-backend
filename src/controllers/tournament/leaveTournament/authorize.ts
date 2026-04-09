import mongoose from "mongoose";
import type { AuthenticatedSession } from "../../../shared/authContext";
import { error, ok } from "../../../shared/helpers";

export interface LeaveTournamentDoc {
  participants?: mongoose.Types.ObjectId[];
}

/**
 * Validates that the user is currently a participant before leaving.
 */
export async function authorizeLeave(
  tournament: LeaveTournamentDoc,
  session: AuthenticatedSession
) {
  const userId = session._id.toString();
  const isParticipant = (tournament.participants ?? []).some(
    (pid: mongoose.Types.ObjectId) => pid.toString() === userId
  );

  if (!isParticipant) {
    return error(400, "You are not a participant in this tournament");
  }

  return ok({}, { status: 200, message: "Authorized" });
}

import type { ClientSession, Types } from "mongoose";
import Schedule from "../../../models/Schedule";
import Tournament from "../../../models/Tournament";
import type { LeaveTournamentPullLean, LeaveTournamentTournamentDoc } from "./types";

function buildLeaveTournamentQuery(tournamentId: string) {
  return Tournament.findById(tournamentId)
    .select("participants firstRoundScheduledAt schedule")
    .populate({
      path: "participants",
      select: "name alias",
    })
    .populate({
      path: "schedule",
      select: "currentRound rounds.round",
    })
    .lean<LeaveTournamentTournamentDoc>();
}

export async function findTournamentForLeave(tournamentId: string) {
  return buildLeaveTournamentQuery(tournamentId).exec();
}

export async function scheduleHasProgressBlockingLeave(
  scheduleId: Types.ObjectId,
  session: ClientSession
) {
  return Schedule.exists({
    _id: scheduleId,
    $or: [
      { currentRound: { $gte: 1 } },
      { rounds: { $elemMatch: { round: { $gte: 1 } } } },
    ],
  }).session(session);
}

export async function pullTournamentParticipantIfNotScheduled(
  tournamentId: string,
  participantId: Types.ObjectId,
  session: ClientSession
) {
  return Tournament.findOneAndUpdate(
    {
      _id: tournamentId,
      participants: participantId,
      $or: [
        { firstRoundScheduledAt: { $exists: false } },
        { firstRoundScheduledAt: null },
      ],
    },
    { $pull: { participants: participantId } },
    { new: true, session }
  )
    .select("participants maxMember")
    .lean<LeaveTournamentPullLean>()
    .exec();
}

export async function findTournamentForLeaveConflictCheck(tournamentId: string) {
  return buildLeaveTournamentQuery(tournamentId).exec();
}

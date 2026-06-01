import type { TournamentScheduleDocument } from "./scheduleContext.schema";
import type { TournamentScheduleContext } from "./types";

type ScheduleTimingSource = Pick<
  TournamentScheduleDocument,
  "matchDurationMinutes" | "breakTimeMinutes"
>;

/**
 * For single-day tournaments, prefer persisted schedule timing over tournament defaults.
 * Returns a fully typed context (object spread otherwise widens required fields on Vercel's tsc).
 */
export function applySingleDayScheduleTiming(
  tournament: TournamentScheduleContext,
  schedule: ScheduleTimingSource | null
): TournamentScheduleContext {
  if (tournament.tournamentMode !== "singleDay") {
    return tournament;
  }

  return {
    _id: tournament._id,
    name: tournament.name,
    minMember: tournament.minMember,
    firstRoundScheduledAt: tournament.firstRoundScheduledAt,
    tournamentMode: tournament.tournamentMode,
    date: tournament.date,
    startTime: tournament.startTime,
    endTime: tournament.endTime,
    timezone: tournament.timezone,
    duration: schedule?.matchDurationMinutes ?? tournament.duration,
    breakDuration: schedule?.breakTimeMinutes ?? tournament.breakDuration,
    totalRounds: tournament.totalRounds,
    playMode: tournament.playMode,
    createdBy: tournament.createdBy,
    club: tournament.club,
    participants: tournament.participants,
    schedule: tournament.schedule,
  };
}

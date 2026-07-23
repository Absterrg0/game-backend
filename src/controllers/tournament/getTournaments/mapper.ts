import type { TournamentListDoc } from "../../../types/api/tournament";
import {
  DEFAULT_TOURNAMENT_TIMEZONE,
  getZonedDateParts,
  resolveTournamentTimeZone,
  zonedDateTimeToUtcDate,
} from "../../../shared/timezone";

export interface TournamentListItem {
  id: string;
  name: string;
  logoUrl: string | null;
  club: { id: string; name: string; logoUrl: string | null } | null;
  date: string | null;
  status: string;
  isFull: boolean;
  isLive: boolean;
  isPast: boolean;
  sponsor: {
    id: string;
    name: string;
    logoUrl?: string | null;
    link?: string | null;
  } | null;
}

function formatDateOnlyUtc(
  value: Date | string,
  timezone?: string | null
): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = getZonedDateParts(
    date,
    timezone ?? DEFAULT_TOURNAMENT_TIMEZONE
  );
  const year = parts.year;
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTimeParts(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

function localDateKey(parts: { year: number; month: number; day: number }): number {
  return parts.year * 10_000 + parts.month * 100 + parts.day;
}

type ScheduleWindow = { startMs: number; endMs: number };

function getTournamentScheduleWindow(t: TournamentListDoc): ScheduleWindow | null {
  if (!t.date) return null;

  const startParts = parseTimeParts(t.startTime);
  const endParts = parseTimeParts(t.endTime);
  if (!startParts || !endParts) return null;

  try {
    const timezone = resolveTournamentTimeZone(t.timezone, DEFAULT_TOURNAMENT_TIMEZONE);
    const dateParts = getZonedDateParts(t.date, timezone);
    const startUtc = zonedDateTimeToUtcDate(
      {
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: startParts.hour,
        minute: startParts.minute,
        second: 0,
      },
      timezone
    );
    const endUtc = zonedDateTimeToUtcDate(
      {
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: endParts.hour,
        minute: endParts.minute,
        second: 0,
      },
      timezone
    );

    const startMs = startUtc.getTime();
    let endMs = endUtc.getTime();

    // If end time is earlier than start time, roll end to the next local calendar day.
    if (endMs < startMs) {
      endMs = zonedDateTimeToUtcDate(
        {
          year: dateParts.year,
          month: dateParts.month,
          day: dateParts.day + 1,
          hour: endParts.hour,
          minute: endParts.minute,
          second: 0,
        },
        timezone
      ).getTime();
    }

    return { startMs, endMs };
  } catch {
    return null;
  }
}

function isCalendarDateBeforeTodayInTimezone(
  t: TournamentListDoc,
  now: Date = new Date()
): boolean {
  if (!t.date) return false;

  try {
    const timezone = resolveTournamentTimeZone(t.timezone, DEFAULT_TOURNAMENT_TIMEZONE);
    const nowParts = getZonedDateParts(now, timezone);
    const dateParts = getZonedDateParts(t.date, timezone);
    return localDateKey(dateParts) < localDateKey(nowParts);
  } catch {
    return false;
  }
}

export function isTournamentLiveByScheduleWindow(
  t: TournamentListDoc,
  now: Date = new Date()
): boolean {
  if (t.status !== "active") return false;

  const window = getTournamentScheduleWindow(t);
  if (!window) return false;

  const nowMs = now.getTime();
  return nowMs >= window.startMs && nowMs <= window.endMs;
}

export function isTournamentPastByScheduleWindow(
  t: TournamentListDoc,
  now: Date = new Date()
): boolean {
  if (t.status !== "active" || !t.date) return false;

  const window = getTournamentScheduleWindow(t);
  if (window) {
    return now.getTime() > window.endMs;
  }

  return isCalendarDateBeforeTodayInTimezone(t, now);
}

export function mapTournamentListItems(
  tournaments: TournamentListDoc[],
): TournamentListItem[] {
  return tournaments.map((t) => {
    return {
      id: t._id.toString(),
      name: t.name,
      logoUrl: t.logoUrl ?? null,
      club: t.club
        ? {
            id: t.club._id.toString(),
            name: t.club.name,
            logoUrl: t.club.logoUrl ?? null,
          }
        : null,
      date: t.date ? formatDateOnlyUtc(t.date, t.timezone) : null,
      status: t.status,
      isFull: t.participantCount >= t.maxMember,
      isLive: isTournamentLiveByScheduleWindow(t),
      isPast: isTournamentPastByScheduleWindow(t),
      sponsor: t.sponsor
        ? {
            id: t.sponsor._id.toString(),
            name: t.sponsor.name,
            logoUrl: t.sponsor.logoUrl,
            link: t.sponsor.link,
          }
        : null,
    };
  });
}

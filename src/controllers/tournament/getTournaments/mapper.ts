import type { TournamentListDoc } from "../../../types/api/tournament";

export interface TournamentListItem {
  id: unknown;
  name: string;
  club: { id: unknown; name: string } | null;
  date: string | null;
  status: string;
  sponsor: {
    id: string;
    name: string;
    logoUrl?: string | null;
    link?: string | null;
  } | null;
}

function formatDateOnlyUtc(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function mapTournamentListItems(tournaments: TournamentListDoc[]) {
  return tournaments.map((t) => ({
    id: t._id,
    name: t.name,
    club: t.club ? { id: t.club._id, name: t.club.name } : null,
    date: t.date ? formatDateOnlyUtc(t.date) : null,
    status: t.status,
    sponsor: t.sponsorId
      ? {
          id: t.sponsorId._id.toString(),
          name: t.sponsorId.name,
          logoUrl: t.sponsorId.logoUrl,
          link: t.sponsorId.link,
        }
      : null,
  }));
}

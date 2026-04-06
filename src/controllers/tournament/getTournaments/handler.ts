import Tournament from "../../../models/Tournament";
import mongoose from "mongoose";
import type { QueryFilter } from "mongoose";
import type { ITournament } from "../../../models/Tournament";
import { escapeRegex } from "../../../lib/validation";
import type { TournamentListDoc } from "../../../types/api/tournament";

import type { GetTournamentQuery } from "./validation";
import type { ListFilterContext } from "./authorize";
import { error, ok } from "../../../shared/helpers";
import {
  findClubIdsForDistanceBand,
  TournamentDistanceBand,
} from "./distanceService";

/**
 * Allowed status values for list filtering.
 */
enum TournamentStatus {
  Active = "active",
  Inactive = "inactive",
  Draft = "draft",
}

const PUBLISHED_STATUSES = [TournamentStatus.Active, TournamentStatus.Inactive] as const;

type TournamentFilter = QueryFilter<ITournament>;

type FilterFailureReason = "NO_ACCESS" | "INVALID_FILTER";

type FilterResult =
  | { ok: true; filter: TournamentFilter }
  | { ok: false; reason: FilterFailureReason };

type ResolvedTournamentQuery = GetTournamentQuery & {
  distanceClubIds?: string[];
};

function isPublishedStatus(status: GetTournamentQuery["status"]): status is TournamentStatus.Active | TournamentStatus.Inactive {
  return status === TournamentStatus.Active || status === TournamentStatus.Inactive;
}

function okFilter(filter: TournamentFilter): FilterResult {
  return { ok: true, filter };
}

function errFilter(reason: FilterFailureReason): FilterResult {
  return { ok: false, reason };
}

function readClubIdInFilter(filter: TournamentFilter) {
  if (!("club" in filter)) return undefined;

  const clubFilter = filter.club;
  if (!clubFilter || typeof clubFilter !== "object") return undefined;
  if (!("$in" in clubFilter)) return undefined;

  const inValues = clubFilter.$in;
  if (!Array.isArray(inValues)) return undefined;

  const clubIds: string[] = [];
  for (const value of inValues) {
    if (typeof value === "string") {
      clubIds.push(value);
      continue;
    }

    if (value != null && typeof value === "object" && "toString" in value) {
      const parsed = value.toString();
      if (typeof parsed === "string") {
        clubIds.push(parsed);
      }
    }
  }

  return clubIds;
}

function toObjectIds(clubIds: string[]) {
  return clubIds.map((clubId) => {
    if (!mongoose.Types.ObjectId.isValid(clubId)) {
      throw new Error(`Invalid club id in tournament filter: ${clubId}`);
    }

    return new mongoose.Types.ObjectId(clubId);
  });
}

function withClubIds(filter: TournamentFilter, clubIds: string[]): TournamentFilter {
  return {
    ...filter,
    club: { $in: toObjectIds(clubIds) },
  };
}

function buildBaseFilterByRole(ctx: ListFilterContext): FilterResult {
  const { isOrganiserOrAbove, isSuperAdmin, manageableClubIds } = ctx;

  if (!isSuperAdmin && isOrganiserOrAbove) {
    if (!manageableClubIds.length) {
      return errFilter("NO_ACCESS");
    }

    return okFilter(withClubIds({}, manageableClubIds));
  }

  if (!isSuperAdmin && !isOrganiserOrAbove) {
    return okFilter({ status: TournamentStatus.Active });
  }

  return okFilter({});
}

function applyStatusFilter(
  filter: TournamentFilter,
  query: ResolvedTournamentQuery
): TournamentFilter {
  if (filter.status) {
    return filter;
  }

  if (query.view === "drafts") {
    return { ...filter, status: TournamentStatus.Draft };
  }

  if (isPublishedStatus(query.status)) {
    return { ...filter, status: query.status };
  }

  return {
    ...filter,
    status: { $in: PUBLISHED_STATUSES },
  };
}

function applyClubFilter(
  filter: TournamentFilter,
  query: ResolvedTournamentQuery,
  _ctx: ListFilterContext
): FilterResult {
  const requestedClubId = query.club;
  if (!requestedClubId) {
    return okFilter(filter);
  }

  const allowedClubIds = readClubIdInFilter(filter);
  if (allowedClubIds && !allowedClubIds.includes(requestedClubId)) {
    return errFilter("NO_ACCESS");
  }

  return okFilter(withClubIds(filter, [requestedClubId]));
}

function applyDistanceFilter(
  filter: TournamentFilter,
  query: ResolvedTournamentQuery,
  ctx: ListFilterContext
): FilterResult {
  if (!query.distance) {
    return okFilter(filter);
  }

  if (!ctx.homeClubCoordinates) {
    return errFilter("INVALID_FILTER");
  }

  const distanceClubIds = query.distanceClubIds;
  if (!distanceClubIds || distanceClubIds.length === 0) {
    return okFilter(withClubIds(filter, []));
  }

  const currentClubIds = readClubIdInFilter(filter);
  if (!currentClubIds) {
    return okFilter(withClubIds(filter, distanceClubIds));
  }

  const intersection = currentClubIds.filter((clubId) => distanceClubIds.includes(clubId));
  if (!intersection.length) {
    return okFilter(withClubIds(filter, []));
  }

  return okFilter(withClubIds(filter, intersection));
}

function applyWhenFilter(
  filter: TournamentFilter,
  query: ResolvedTournamentQuery
): TournamentFilter {
  if (!query.when) {
    return filter;
  }

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);

  const hours = String(now.getUTCHours()).padStart(2, "0");
  const minutes = String(now.getUTCMinutes()).padStart(2, "0");
  const nowTime = `${hours}:${minutes}`;

  if (query.when === "future") {
    return {
      ...filter,
      $or: [
        { date: { $gte: startOfTomorrow } },
        {
          date: { $gte: startOfToday, $lt: startOfTomorrow },
          $or: [
            { endTime: { $exists: false } },
            { endTime: "" },
            { endTime: { $gte: nowTime } },
          ],
        },
      ],
    };
  }

  return {
    ...filter,
    $or: [
      { date: { $lt: startOfToday } },
      {
        date: { $gte: startOfToday, $lt: startOfTomorrow },
        endTime: { $exists: true, $ne: "", $lt: nowTime },
      },
    ],
  };
}

function applySearchFilter(
  filter: TournamentFilter,
  query: ResolvedTournamentQuery
): TournamentFilter {
  if (!query.q?.trim()) {
    return filter;
  }

  return {
    ...filter,
    name: {
      $regex: escapeRegex(query.q.trim()),
      $options: "i",
    },
  };
}

function buildTournamentFilter(
  query: ResolvedTournamentQuery,
  ctx: ListFilterContext
): FilterResult {
  const baseResult = buildBaseFilterByRole(ctx);
  if (!baseResult.ok) {
    return baseResult;
  }

  let filter = baseResult.filter;

  filter = applyStatusFilter(filter, query);

  const clubResult = applyClubFilter(filter, query, ctx);
  if (!clubResult.ok) {
    return clubResult;
  }
  filter = clubResult.filter;

  const distanceResult = applyDistanceFilter(filter, query, ctx);
  if (!distanceResult.ok) {
    return distanceResult;
  }
  filter = distanceResult.filter;

  filter = applyWhenFilter(filter, query);
  filter = applySearchFilter(filter, query);

  return okFilter(filter);
}

/**
 * Fetches tournaments using pagination and role-based filtering.
 */
export async function getTournamentsFlow(
  query: GetTournamentQuery,
  ctx: ListFilterContext
) {
  const { page, limit } = query;

  let resolvedQuery: ResolvedTournamentQuery = query;

  if (query.distance) {
    if (!ctx.homeClubCoordinates) {
      return error(400, "A home club is required for distance filtering");
    }

    const distanceBand = query.distance as TournamentDistanceBand;

    const distanceClubIds = await findClubIdsForDistanceBand(
      ctx.homeClubCoordinates,
      distanceBand
    );

    resolvedQuery = {
      ...query,
      distanceClubIds,
    };
  }

  const filterResult = buildTournamentFilter(resolvedQuery, ctx);

  if (!filterResult.ok) {
    if (filterResult.reason === "NO_ACCESS") {
      return error(403, "You do not have access to these tournaments");
    }
    return error(400, "Invalid tournament filter configuration");
  }

  const filter = filterResult.filter;

  const skip = (page - 1) * limit;

  const tournamentsQuery = Tournament.find(filter)
    .populate("club", "name")
    .populate("sponsor", "name logoUrl link")
    .sort({ date: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean<TournamentListDoc[]>()
    .exec();

  const countQuery = Tournament.countDocuments(filter).exec();

  const [tournaments, total] = await Promise.all([
    tournamentsQuery,
    countQuery,
  ]);

  return ok({
    tournaments,
    total,
    page,
    limit,
  }, { status: 200, message: "Tournaments listed successfully" });
}
import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { AuthenticatedRequest, type AuthenticatedSession } from "../../../shared/authContext";
import { updateDraftSchema } from "./validation";
import { authorizeUpdate } from "./authorize";
import { fetchTournamentForUpdate } from "./queries";
import { updateTournamentFlow } from "./handler";
import { validateActiveTournamentEnrolledUpdate } from "./activeEnrolledUpdate";
import { publishSchema } from "../../../validation/tournament.schemas";
import { getClubCourtIds } from "../createTournament/queries";

/**
 * PATCH /api/tournaments/:id
 * Update tournament. Existing draft and published tournaments can be updated.
 */
export async function updateTournament(req: AuthenticatedRequest ,res: Response){
  try {

    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const bodyParse = updateDraftSchema.safeParse(req.body);
    if (!bodyParse.success) {
      const message = bodyParse.error.issues.map((i) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      return;
    }

    const tournament = await fetchTournamentForUpdate(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }
    if (tournament.status !== 200) {
      res.status(tournament.status).json(buildErrorPayload(tournament.message));
      return;
    }

    const enrolledGuard = validateActiveTournamentEnrolledUpdate(
      tournament.data,
      bodyParse.data
    );
    if (!enrolledGuard.ok) {
      res.status(enrolledGuard.status).json(buildErrorPayload(enrolledGuard.message));
      return;
    }

    const authResult = await authorizeUpdate(tournament.data, bodyParse.data, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const nextStatus = bodyParse.data.status ?? tournament.data.status;
    if (nextStatus === "active") {
      const clubId = authResult.data.clubId;
      const shouldClearSponsor = authResult.data.clubChanged && bodyParse.data.sponsor === undefined;
      const effectiveSponsor = shouldClearSponsor
        ? null
        : (bodyParse.data.sponsor ?? tournament.data.sponsor ?? null);

      const publishCandidate = {
        club: clubId,
        sponsor: effectiveSponsor,
        name: bodyParse.data.name ?? tournament.data.name,
        date: bodyParse.data.date ?? tournament.data.date ?? null,
        startTime: bodyParse.data.startTime ?? tournament.data.startTime ?? null,
        endTime: bodyParse.data.endTime ?? tournament.data.endTime ?? null,
        playMode: bodyParse.data.playMode ?? tournament.data.playMode,
        tournamentMode: bodyParse.data.tournamentMode ?? tournament.data.tournamentMode,
        entryFee: bodyParse.data.entryFee ?? tournament.data.entryFee,
        minMember: bodyParse.data.minMember ?? tournament.data.minMember,
        maxMember: bodyParse.data.maxMember ?? tournament.data.maxMember,
        duration: bodyParse.data.duration ?? tournament.data.duration ?? "",
        breakDuration: bodyParse.data.breakDuration ?? tournament.data.breakDuration ?? "",
        foodInfo: bodyParse.data.foodInfo ?? tournament.data.foodInfo ?? "",
        descriptionInfo: bodyParse.data.descriptionInfo ?? tournament.data.descriptionInfo ?? "",
        status: "active" as const,
      };

      const publishValidation = publishSchema.safeParse(publishCandidate);
      if (!publishValidation.success) {
        const message = publishValidation.error.issues.map((issue) => issue.message).join("; ");
        res.status(400).json(buildErrorPayload(message || "Tournament publish validation failed"));
        return;
      }

      const clubCourtIds = await getClubCourtIds(clubId);
      if (clubCourtIds.length === 0) {
        res.status(400).json(
          buildErrorPayload("Selected club has no courts. Add at least one court before publishing this tournament.")
        );
        return;
      }
    }

    const result = await updateTournamentFlow(idResult.data, bodyParse.data, {
      clubChanged: authResult.data.clubChanged,
    });
    if (!result) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    res.status(200).json({
      message: "Tournament updated",
      tournament: result.tournament,
    });
  } catch (err: unknown) {
    const mongoErr = err as { code?: number; keyPattern?: Record<string, number> };
    if (mongoErr?.code === 11000) {
      if (mongoErr.keyPattern?.club === 1 && mongoErr.keyPattern?.name === 1) {
        res.status(409).json(buildErrorPayload("A tournament with this name already exists in the selected club"));
        return;
      }
      if (mongoErr.keyPattern?.name === 1) {
        res.status(409).json(buildErrorPayload("A tournament with this name already exists"));
        return;
      }
      res.status(409).json(buildErrorPayload("A tournament with the same unique data already exists"));
      return;
    }

    logger.error("Error updating tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}

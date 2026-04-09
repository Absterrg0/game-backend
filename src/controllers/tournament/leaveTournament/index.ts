import type { Response } from "express";
import Tournament from "../../../models/Tournament";
import { logger } from "../../../lib/logger";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { AuthenticatedRequest } from "../../../shared/authContext";
import { authorizeLeave } from "./authorize";
import { leaveTournamentFlow } from "./handler";

/**
 * POST /api/tournaments/:id/leave
 * Leave a tournament the current user has joined.
 */
export async function leaveTournament(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const tournament = await Tournament.findById(idResult.data)
      .select("_id participants")
      .lean()
      .exec();

    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeLeave(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const result = await leaveTournamentFlow(idResult.data, req.user);
    if (result.status !== 200) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }

    res.status(200).json({
      message: "Successfully left tournament",
      tournament: {
        id: result.data.tournamentId,
        spotsFilled: result.data.spotsFilled,
        spotsTotal: result.data.spotsTotal,
        isParticipant: result.data.isParticipant,
      },
    });
  } catch (err: unknown) {
    logger.error("Error leaving tournament", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}

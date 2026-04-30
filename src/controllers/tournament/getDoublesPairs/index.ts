import type { Response } from "express";
import { logger } from "../../../lib/logger";
import { AuthenticatedRequest } from "../../../shared/authContext";
import { guardIdParam } from "../../../shared/guards";
import { buildErrorPayload } from "../../../shared/errors";
import { authorizeGetById } from "../shared/authorizeGetById";
import { fetchTournamentById } from "../shared/fetchTournamentById";
import { sanitizeDoublesPairs } from "../shared/doublesPairs";

/**
 * GET /api/tournaments/:id/doubles-pairs
 * Returns reciprocal doubles pairs for current tournament participants.
 */
export async function getDoublesPairs(req: AuthenticatedRequest, res: Response) {
  try {
    const idResult = guardIdParam(req.params, "tournament ID");
    if (!idResult.ok) {
      res.status(idResult.status).json(buildErrorPayload(idResult.message));
      return;
    }

    const tournament = await fetchTournamentById(idResult.data);
    if (!tournament) {
      res.status(404).json(buildErrorPayload("Tournament not found"));
      return;
    }

    const authResult = await authorizeGetById(tournament, req.user);
    if (authResult.status !== 200) {
      res.status(authResult.status).json(buildErrorPayload(authResult.message));
      return;
    }

    const participantIds = (tournament.participants ?? []).map((participant) => participant._id.toString());
    const doublesPairs = sanitizeDoublesPairs(tournament.doublesPairs, participantIds);

    res.status(200).json({ doublesPairs });
  } catch (err: unknown) {
    logger.error("Error fetching doubles pairs", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}

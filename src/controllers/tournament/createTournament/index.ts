import type { Request, Response } from "express";
import { logger } from "../../../lib/logger";
import { buildErrorPayload } from "../../../shared/errors";
import { createTournamentSchema } from "./validation";
import { createTournamentFlow } from "./handler";
import { AuthenticatedRequest } from "../../../shared";

/**
 * POST /api/tournaments
 * Create tournament as draft or publish. Body must match createTournamentSchema
 * (discriminated union on status and tournamentMode).
 */
export async function createTournament(req: AuthenticatedRequest, res: Response) {
  try {
    // #region agent log
    const body = req.body as Record<string, unknown>;
    fetch("http://127.0.0.1:7679/ingest/811fd15d-6f4d-4d49-bd5c-4454dc516274", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b0a976" },
      body: JSON.stringify({
        sessionId: "b0a976",
        runId: "pre-parse",
        hypothesisId: "H2",
        location: "createTournament/index.ts:createTournament",
        message: "POST /api/tournaments body types",
        data: {
          typeofDuration: typeof body?.duration,
          typeofBreakDuration: typeof body?.breakDuration,
          duration: body?.duration,
          breakDuration: body?.breakDuration,
          status: body?.status,
          tournamentMode: body?.tournamentMode,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const parsed = createTournamentSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i: { message: string }) => i.message).join("; ");
      res.status(400).json(buildErrorPayload(message));
      logger.error("Invalid tournament creation request", {
        errors: message,
      });
      return;
    }

    const result = await createTournamentFlow(parsed.data, req.user);

    if (result.status !== 200) {
      res.status(result.status).json(buildErrorPayload(result.message));
      return;
    }

    const tournament = result.data.tournament;
    const statusMessage =
      tournament?.status === "draft" ? "Draft saved" : "Tournament published";
    res.status(201).json({
      message: statusMessage,
      tournament,
    });
  } catch (err: unknown) {
    logger.error("Internal server error", { err });
    res.status(500).json(buildErrorPayload("Internal server error"));
  }
}

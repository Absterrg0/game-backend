import { Router } from "express";
import {
  getTournaments,
  getTournamentLiveMatch,
  getTournamentById,
  getTournamentMatches,
  recordMatchScore,
  joinTournament,
  leaveTournament,
  createTournament,
  updateTournament,
  generateScoreQr,
  generateIndependentScoreQr,
  getActiveScoreQr,
  validateScoreQr,
  confirmScoreQr,
} from "../controllers/tournament/controller";
import {
  requireOrganiserOrAbove,
  requirePlayerOrAbove,
} from "../middlewares/rbac";
import { createAuthedRouter } from "./authedRouter";

const router = Router();
const authed = createAuthedRouter(router);

authed.get("/", requirePlayerOrAbove, getTournaments);
authed.get("/live-match", requirePlayerOrAbove, getTournamentLiveMatch);
authed.get("/:id", requirePlayerOrAbove, getTournamentById);
authed.get("/:id/matches", requirePlayerOrAbove, getTournamentMatches);
authed.patch(
  "/:id/matches/:matchId/score",
  requirePlayerOrAbove,
  recordMatchScore,
);

// Score QR flow
authed.post(
  "/:id/matches/:matchId/score/qr",
  requirePlayerOrAbove,
  generateScoreQr,
);

// Independent (non-tournament) score QR flow
authed.post(
  "/score-qr/independent",
  requirePlayerOrAbove,
  generateIndependentScoreQr,
);

authed.get("/score-qr/active", requirePlayerOrAbove, getActiveScoreQr);

// Public validation endpoint (no auth required), used after scanning QR.
router.get("/score-qr/:token", validateScoreQr);

// Confirmation still requires an authenticated opponent.
authed.post("/score-qr/confirm", requirePlayerOrAbove, confirmScoreQr);

authed.post("/:id/join", requirePlayerOrAbove, joinTournament);
authed.post("/:id/leave", requirePlayerOrAbove, leaveTournament);
authed.post("/", requireOrganiserOrAbove, createTournament);
authed.patch("/:id", requireOrganiserOrAbove, updateTournament);

export default router;

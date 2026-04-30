import { Router } from "express";
import {
  cancelScheduleRound,
  generateDoublesPairs,
  generateSchedule,
  getSchedule,
} from "../controllers/schedule/controller";
import { requireOrganiserOrAbove } from "../middlewares/rbac";
import { createAuthedRouter } from "./authedRouter";

const router = Router();
const authed = createAuthedRouter(router);

authed.get("/:id", requireOrganiserOrAbove, getSchedule);
authed.delete("/:id/round/:round", requireOrganiserOrAbove, cancelScheduleRound);
authed.post("/:id/pairs", requireOrganiserOrAbove, generateDoublesPairs);
authed.post("/:id", requireOrganiserOrAbove, generateSchedule);

export default router;

import express from "express";
import {
  getProgressOverview,
  getCandidateProgress,
  getTeamProgress,
  updateTaskProgress,
} from "../controllers/progressController.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getProgressOverview);
router.get("/candidates", getCandidateProgress);
router.get("/teams", getTeamProgress);
router.put("/:assignmentId", updateTaskProgress);

export default router;
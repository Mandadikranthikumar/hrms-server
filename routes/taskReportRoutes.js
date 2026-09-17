import express from "express";
import {
  getOverviewReport,
  getCandidatePerformanceReport,
  getTeamPerformanceReport,
  getTaskWiseReport,
} from "../controllers/taskReportController.js";
import { verifyToken, authorizeRoles } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);
// Employee and HR/Admin can access overview and tasks reports
router.get("/overview", authorizeRoles("Admin", "HR", "HR Manager", "Employee"), getOverviewReport);
router.get("/tasks", authorizeRoles("Admin", "HR", "HR Manager", "Employee"), getTaskWiseReport);

// Only HR/Admin can access full organization candidate and team aggregate reports
router.get("/candidates", authorizeRoles("Admin", "HR", "HR Manager"), getCandidatePerformanceReport);
router.get("/teams", authorizeRoles("Admin", "HR", "HR Manager"), getTeamPerformanceReport);

export default router;
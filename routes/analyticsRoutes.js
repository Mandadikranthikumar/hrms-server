import express from "express";
import {
  getSummaryStats,
  getPayrollTrend,
  getDepartmentBreakdown,
  getTopEarners,
  getDeductionBreakdown,
} from "../controllers/analyticsController.js";

const router = express.Router();

router.get("/summary", getSummaryStats);
router.get("/trend", getPayrollTrend);
router.get("/department-breakdown", getDepartmentBreakdown);
router.get("/top-earners", getTopEarners);
router.get("/deduction-breakdown", getDeductionBreakdown);

export default router;
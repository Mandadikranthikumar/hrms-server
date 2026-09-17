import express from "express";
import {
  generateMonthlyReport,
  generateYearlyReport,
  generateEmployeeReport,
  generateDepartmentReport,
  getAllReports,
  getReportById,
  exportReport,
} from "../controllers/reportController.js";

const router = express.Router();

router.post("/monthly", generateMonthlyReport);
router.post("/yearly", generateYearlyReport);
router.post("/employee", generateEmployeeReport);
router.post("/department", generateDepartmentReport);
router.get("/", getAllReports);
router.get("/:id/export", exportReport);
router.get("/:id", getReportById);

export default router;
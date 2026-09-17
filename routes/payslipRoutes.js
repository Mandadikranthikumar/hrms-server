import express from "express";
import {
  generatePayslip,
  getAllPayslips,
  getPayslipById,
  getPayslipsByEmployee,
  updatePayslipStatus,
  downloadPayslipPDF,
  deletePayslip,
} from "../controllers/payslipController.js";

const router = express.Router();

router.post("/generate", generatePayslip);
router.get("/", getAllPayslips);
router.get("/employee/:employeeId", getPayslipsByEmployee);
router.get("/:id/download", downloadPayslipPDF);
router.get("/:id", getPayslipById);
router.patch("/:id/status", updatePayslipStatus);
router.delete("/:id", deletePayslip);

export default router;
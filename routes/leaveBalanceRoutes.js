import express from "express";
import {
  getMyLeaveBalance,
  getEmployeeLeaveBalance,
} from "../controllers/leaveBalanceController.js";
import {
  verifyToken,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

// GET logged-in employee balance
router.get("/me", verifyToken, getMyLeaveBalance);

// GET specific employee balance (Admin and HR only)
router.get(
  "/:employeeId",
  verifyToken,
  authorizeRoles("Admin", "HR"),
  getEmployeeLeaveBalance
);

export default router;

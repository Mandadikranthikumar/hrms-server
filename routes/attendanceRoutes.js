import express from "express";

import {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getMonthlyAttendance,
  getAttendanceCalendar,
  getAllAttendanceAdmin,
} from "../controllers/AttendanceController.js";

import {
  validateCheckIn,
  validateCheckOut,
  validateMonthlyAttendance,
} from "../validations/attendanceValidation.js";

import {
  verifyToken,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Attendance Routes Working"
  });
});


router.post(
  "/check-in",
  verifyToken,
  authorizeRoles("Employee", "HR", "HR Manager"),
  validateCheckIn,
  checkIn
);


router.post(
  "/check-out",
  verifyToken,
  authorizeRoles("Employee", "HR", "HR Manager"),
  validateCheckOut,
  checkOut
);


router.get(
  "/today",
  verifyToken,
  authorizeRoles("Employee", "HR", "HR Manager", "Admin"),
  getTodayAttendance
);


router.get(
  "/history",
  verifyToken,
  authorizeRoles("Employee", "HR", "HR Manager", "Admin"),
  getAttendanceHistory
);


router.get(
  "/month/:year/:month",
  verifyToken,
  authorizeRoles("Employee", "HR", "HR Manager", "Admin"),
  validateMonthlyAttendance,
  getMonthlyAttendance
);


router.get(
  "/calendar/:year/:month",
  verifyToken,
  authorizeRoles("Employee", "HR", "HR Manager", "Admin"),
  getAttendanceCalendar
);


router.get(
  "/admin/all",
  verifyToken,
  authorizeRoles("Admin", "HR", "HR Manager"),
  getAllAttendanceAdmin
);

export default router;
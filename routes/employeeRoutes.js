import express from "express";

import {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  updateEmployeeStatus,
  getMyProfile,
  updateMyProfile,
} from "../controllers/EmployeeController.js";

import {
  verifyToken,
  authorizeRoles,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/profile", verifyToken, getMyProfile);

router.put("/profile", verifyToken, updateMyProfile);

router.post(
  "/",
  verifyToken,
  authorizeRoles("Admin", "super_admin", "HR", "HR Manager"),
  createEmployee
);

router.get(
  "/",
  verifyToken,
  authorizeRoles("Admin", "super_admin", "HR", "HR Manager", "Employee"),
  getAllEmployees
);

router.get(
  "/:id",
  verifyToken,
  authorizeRoles("Admin", "super_admin", "HR", "HR Manager"),
  getEmployeeById
);

router.put(
  "/:id",
  verifyToken,
  authorizeRoles("Admin", "super_admin", "HR", "HR Manager"),
  updateEmployee
);

router.delete(
  "/:id",
  verifyToken,
  authorizeRoles("Admin", "super_admin", "HR", "HR Manager"),
  deleteEmployee
);

router.patch(
  "/:id/status",
  verifyToken,
  authorizeRoles("Admin", "super_admin", "HR", "HR Manager"),
  updateEmployeeStatus
);

export default router;
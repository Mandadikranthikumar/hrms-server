import express from "express";
import {
  getDashboardStats,
  createOrganization,
  getAllOrganizations,
  getOrganizationById,
  getOrganizationEmployees,
  updateOrganization,
  updateOrganizationLimit,
  toggleOrganizationStatus,
  createHR,
  getAllHR,
  updateHR,
  getOrganizationUsage,
} from "../controllers/superAdminController.js";
import {
  verifyToken,
  authorizeSuperAdmin,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

// All Super Admin routes require valid JWT token and super_admin role
router.use(verifyToken, authorizeSuperAdmin);

// Dashboard
router.get("/dashboard", getDashboardStats);

// Organizations
router.get("/organizations", getAllOrganizations);
router.post("/organizations", createOrganization);
router.get("/organizations/:id", getOrganizationById);
router.get("/organizations/:id/employees", getOrganizationEmployees);
router.put("/organizations/:id", updateOrganization);
router.patch("/organizations/:id/limit", updateOrganizationLimit);
router.patch("/organizations/:id/status", toggleOrganizationStatus);


// HR Management
router.get("/hr", getAllHR);
router.post("/hr", createHR);
router.put("/hr/:id", updateHR);

// Organization Usage & Limits
router.get("/usage", getOrganizationUsage);

// Payroll & Bonus Management for Super Admin
import {
  getSuperAdminPayroll,
  paySingleSalary,
  payBonus,
  payAllSalaries,
  updateEmployeePayrollConfig,
} from "../controllers/superAdminPayrollController.js";

router.get("/payroll", getSuperAdminPayroll);
router.post("/payroll/pay-single", paySingleSalary);
router.post("/payroll/pay-bonus", payBonus);
router.post("/payroll/pay-all", payAllSalaries);
router.put("/payroll/config/:employeeId", updateEmployeePayrollConfig);

export default router;

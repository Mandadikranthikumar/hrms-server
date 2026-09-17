// server/routes/payrollRoutes.js

import express from 'express';
import {
  generatePayroll,
  getAllPayrolls,
  getPayrollsByEmployee,
  getPayrollById,
  markPayrollAsPaid,
  downloadPayrollPDF,
} from '../controllers/payrollController.js';
import { validateGeneratePayroll } from '../validations/payrollValidation.js';
import { verifyToken, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ── Admin-only write operations ─────────────────────────────────────────────
router.post('/generate',
  verifyToken,
  authorizeRoles('Admin', 'super_admin'),
  validateGeneratePayroll,
  generatePayroll
);

router.patch('/:id/mark-paid',
  verifyToken,
  authorizeRoles('Admin', 'super_admin'),
  markPayrollAsPaid
);

// ── Admin + HR Manager + Employee read operations ─────────────────────────
router.get('/',
  verifyToken,
  authorizeRoles('Admin', 'super_admin', 'HR', 'Employee'),
  getAllPayrolls
);

router.get('/employee/:employeeId',
  verifyToken,
  authorizeRoles('Admin', 'super_admin', 'HR', 'Employee'),
  getPayrollsByEmployee
);

router.get('/:id/download',
  verifyToken,
  authorizeRoles('Admin', 'super_admin', 'HR', 'Employee'),
  downloadPayrollPDF
);

router.get('/:id',
  verifyToken,
  authorizeRoles('Admin', 'super_admin', 'HR', 'Employee'),
  getPayrollById
);

export default router;
// server/routes/salaryRoutes.js

import express from 'express';
import {
  createSalary,
  getAllSalaries,
  getSalaryByEmployee,
  getSalaryById,
  updateSalary,
  deactivateSalary,
} from '../controllers/salaryController.js';
import { validateCreateSalary, validateUpdateSalary } from '../validations/salaryValidation.js';
import { verifyToken, authorizeRoles } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ── Admin-only write operations ──────────────────────────────────────────────
router.post('/',
  verifyToken,
  authorizeRoles('Admin'),
  validateCreateSalary,
  createSalary
);

router.put('/:id',
  verifyToken,
  authorizeRoles('Admin'),
  validateUpdateSalary,
  updateSalary
);

router.delete('/:id',
  verifyToken,
  authorizeRoles('Admin'),
  deactivateSalary
);

// ── Admin + HR Manager read operations ───────────────────────────────────────
router.get('/',
  verifyToken,
  authorizeRoles('Admin', 'HR'),
  getAllSalaries
);

router.get('/id/:id',
  verifyToken,
  authorizeRoles('Admin', 'HR'),
  getSalaryById
);

router.get('/:employeeId',
  verifyToken,
  authorizeRoles('Admin', 'HR'),
  getSalaryByEmployee
);

export default router;
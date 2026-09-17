// server/controllers/salaryController.js

import Salary from '../models/Salary.js';

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const populateEmployee = {
  path: 'employeeId',
  select: 'employee_code designation user_id department_id',
  populate: [
    { path: 'user_id', select: 'name email phone' },
    { path: 'department_id', select: 'departmentId departmentName' },
  ],
};

export const createSalary = async (req, res) => {
  try {
    const { employeeId, basicSalary, hra, allowances, bonus, deductions, effectiveFrom } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID is required',
      });
    }

    if (basicSalary === undefined || isNaN(Number(basicSalary)) || Number(basicSalary) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Basic salary is required and cannot be negative',
      });
    }

    // Normalize effective month/year so all dates in the same month are treated consistently
    const effDate = new Date(effectiveFrom || Date.now());
    const year = effDate.getFullYear();
    const month = effDate.getMonth(); // 0 to 11
    const monthLabel = `${monthNames[month]} ${year}`;

    const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Check if an active salary already exists for this employee for this month
    const existingSalary = await Salary.findOne({
      employeeId,
      isActive: true,
      effectiveFrom: { $gte: startOfMonth, $lte: endOfMonth },
    });

    if (existingSalary) {
      return res.status(409).json({
        success: false,
        message: `Salary already exists for this employee for ${monthLabel}.`,
      });
    }

    const salary = await Salary.create({
      employeeId,
      basicSalary: Number(basicSalary),
      hra: Number(hra) || 0,
      allowances: Number(allowances) || 0,
      bonus: Number(bonus) || 0,
      deductions: Number(deductions) || 0,
      effectiveFrom: effDate,
      isActive: true,
      createdBy: req.user?._id || req.user?.id || null,
    });

    const populatedSalary = await Salary.findById(salary._id).populate(populateEmployee);

    return res.status(201).json({
      success: true,
      message: 'Salary structure created successfully',
      data: populatedSalary,
    });
  } catch (error) {
    console.error('CREATE SALARY ERROR:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create salary structure',
    });
  }
};

export const getAllSalaries = async (req, res) => {
  try {
    const salaries = await Salary.find({ isActive: true })
      .populate(populateEmployee)
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: salaries.length,
      data: salaries,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch salary structures',
      error: error.message,
    });
  }
};

export const getSalaryByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const salary = await Salary.findOne({ employeeId, isActive: true }).populate(populateEmployee);

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'No active salary structure found for this employee',
      });
    }

    return res.status(200).json({ success: true, data: salary });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch salary structure',
      error: error.message,
    });
  }
};

export const getSalaryById = async (req, res) => {
  try {
    const { id } = req.params;

    const salary = await Salary.findById(id).populate(populateEmployee);

    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary structure not found',
      });
    }

    return res.status(200).json({ success: true, data: salary });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch salary structure',
      error: error.message,
    });
  }
};

export const updateSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId, basicSalary, hra, allowances, bonus, deductions, effectiveFrom } = req.body;

    const existingSalary = await Salary.findById(id);
    if (!existingSalary) {
      return res.status(404).json({
        success: false,
        message: 'Salary structure not found',
      });
    }

    const targetEmpId = employeeId || existingSalary.employeeId;
    const effDate = new Date(effectiveFrom || existingSalary.effectiveFrom || Date.now());
    const year = effDate.getFullYear();
    const month = effDate.getMonth();
    const monthLabel = `${monthNames[month]} ${year}`;

    const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const duplicateSalary = await Salary.findOne({
      _id: { $ne: id },
      employeeId: targetEmpId,
      isActive: true,
      effectiveFrom: { $gte: startOfMonth, $lte: endOfMonth },
    });

    if (duplicateSalary) {
      return res.status(409).json({
        success: false,
        message: `Salary already exists for this employee for ${monthLabel}.`,
      });
    }

    existingSalary.isActive = false;
    await existingSalary.save();

    const newSalary = await Salary.create({
      employeeId: targetEmpId,
      basicSalary: basicSalary !== undefined ? Number(basicSalary) : existingSalary.basicSalary,
      hra: hra !== undefined ? Number(hra) : existingSalary.hra,
      allowances: allowances !== undefined ? Number(allowances) : existingSalary.allowances,
      bonus: bonus !== undefined ? Number(bonus) : existingSalary.bonus,
      deductions: deductions !== undefined ? Number(deductions) : existingSalary.deductions,
      effectiveFrom: effDate,
      isActive: true,
      createdBy: req.user?._id || req.user?.id || null,
    });

    const populatedNewSalary = await Salary.findById(newSalary._id).populate(populateEmployee);

    return res.status(200).json({
      success: true,
      message: 'Salary structure updated successfully',
      data: populatedNewSalary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update salary structure',
    });
  }
};

export const deactivateSalary = async (req, res) => {
  try {
    const { id } = req.params;

    const salary = await Salary.findById(id);
    if (!salary) {
      return res.status(404).json({
        success: false,
        message: 'Salary structure not found',
      });
    }

    salary.isActive = false;
    await salary.save();

    return res.status(200).json({
      success: true,
      message: 'Salary structure deactivated successfully',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to deactivate salary structure',
      error: error.message,
    });
  }
};

export default {
  createSalary,
  getAllSalaries,
  getSalaryByEmployee,
  getSalaryById,
  updateSalary,
  deactivateSalary,
};

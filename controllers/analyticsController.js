import Payroll from "../models/Payroll.js";
import Employee from "../models/Employee.js";

// -------------------------------------------------------
// GET /api/analytics/summary
// Dashboard s: totalEmployees, grossPay, deductions, netPay
// -------------------------------------------------------
export const getSummaryStats = async (req, res) => {
  try {
    const { year } = req.query;
    const matchStage = {};
    if (year) matchStage.year = Number(year);

    const [payrollAgg, totalEmployees] = await Promise.all([
      Payroll.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalGrossPay: { $sum: "$grossSalary" },
            totalDeductions: { $sum: "$deductions" },
            totalNetPay: { $sum: "$netSalary" },
            avgNetPay: { $avg: "$netSalary" },
          },
        },
      ]),
      Employee.countDocuments({ employment_status: "Active" }),
    ]);

    const payrollStats = payrollAgg[0] || {
      totalGrossPay: 0,
      totalDeductions: 0,
      totalNetPay: 0,
      avgNetPay: 0,
    };
    delete payrollStats._id;

    return res.status(200).json({
      success: true,
      data: {
        totalEmployees,
        totalGrossPay: payrollStats.totalGrossPay,
        totalDeductions: payrollStats.totalDeductions,
        totalNetPay: payrollStats.totalNetPay,
        averageSalary: Math.round(payrollStats.avgNetPay || 0),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch summary stats",
      error: error.message,
    });
  }
};

// -------------------------------------------------------
// GET /api/analytics/trend?year=2026
// Payroll trend: gross vs net pay per month
// -------------------------------------------------------
export const getPayrollTrend = async (req, res) => {
  try {
    const { year } = req.query;
    const matchStage = year ? { year: Number(year) } : {};

    const trend = await Payroll.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { year: "$year", month: "$month" },
          totalGrossPay: { $sum: "$grossSalary" },
          totalDeductions: { $sum: "$deductions" },
          totalNetPay: { $sum: "$netSalary" },
          employeeCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    return res.status(200).json({
      success: true,
      count: trend.length,
      data: trend,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payroll trend",
      error: error.message,
    });
  }
};

// -------------------------------------------------------
// GET /api/analytics/department-breakdown?month=8&year=2026
// Net salary by department using Payroll → employee_details join
// -------------------------------------------------------
export const getDepartmentBreakdown = async (req, res) => {
  try {
    const { month, year } = req.query;
    const matchStage = {};
    if (month) matchStage.month = Number(month);
    if (year) matchStage.year = Number(year);

    const breakdown = await Payroll.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "employee_details",
          localField: "employeeId",
          foreignField: "_id",
          as: "employee",
        },
      },
      { $unwind: { path: "$employee", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "departments",
          localField: "employee.department_id",
          foreignField: "_id",
          as: "department",
        },
      },
      { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            $ifNull: ["$department.departmentName", "$employeeSnapshot.department"],
          },
          totalNetPay: { $sum: "$netSalary" },
          totalGrossPay: { $sum: "$grossSalary" },
          employeeCount: { $sum: 1 },
          avgSalary: { $avg: "$netSalary" },
        },
      },
      { $sort: { totalNetPay: -1 } },
      {
        $project: {
          _id: 0,
          department: "$_id",
          totalNetPay: 1,
          totalGrossPay: 1,
          employeeCount: 1,
          averageSalary: { $round: ["$avgSalary", 0] },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      count: breakdown.length,
      data: breakdown,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch department breakdown",
      error: error.message,
    });
  }
};

// -------------------------------------------------------
// GET /api/analytics/top-earners?month=8&year=2026&limit=5
// Top earners with employee name from Payroll.employeeSnapshot
// -------------------------------------------------------
export const getTopEarners = async (req, res) => {
  try {
    const { month, year, limit } = req.query;
    const matchStage = {};
    if (month) matchStage.month = Number(month);
    if (year) matchStage.year = Number(year);

    const topEarners = await Payroll.find(matchStage)
      .populate({
        path: "employeeId",
        select: "employee_code designation user_id",
        populate: { path: "user_id", select: "name email" },
      })
      .sort({ netSalary: -1 })
      .limit(Number(limit) || 5);

    // Shape response: always return readable employee info
    const shaped = topEarners.map((p) => {
      const snap = p.employeeSnapshot || {};
      const empCode =
        (p.employeeId && p.employeeId.employee_code) || snap.employeeCode || "";
      const empName =
        (p.employeeId && p.employeeId.user_id && p.employeeId.user_id.name) ||
        snap.fullName ||
        "";
      const designation =
        (p.employeeId && p.employeeId.designation) || snap.designation || "";
      const department = snap.department || "";

      return {
        _id: p._id,
        employeeCode: empCode,
        employeeName: empName,
        designation,
        department,
        month: p.month,
        year: p.year,
        grossSalary: p.grossSalary,
        netSalary: p.netSalary,
        deductions: p.deductions,
        status: p.status,
      };
    });

    return res.status(200).json({
      success: true,
      count: shaped.length,
      data: shaped,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch top earners",
      error: error.message,
    });
  }
};

// -------------------------------------------------------
// GET /api/analytics/deduction-breakdown?month=8&year=2026
// Deduction breakdown. Payroll stores a single `deductions` number,
// so we report it as total deduction (no sub-categories).
// -------------------------------------------------------
export const getDeductionBreakdown = async (req, res) => {
  try {
    const { month, year } = req.query;
    const matchStage = {};
    if (month) matchStage.month = Number(month);
    if (year) matchStage.year = Number(year);

    const result = await Payroll.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalDeductions: { $sum: "$deductions" },
          totalBasicSalary: { $sum: "$basicSalary" },
          totalHRA: { $sum: "$hra" },
          totalAllowances: { $sum: "$allowances" },
          totalBonus: { $sum: "$bonus" },
        },
      },
    ]);

    const breakdown = result[0] || {
      totalDeductions: 0,
      totalBasicSalary: 0,
      totalHRA: 0,
      totalAllowances: 0,
      totalBonus: 0,
    };
    delete breakdown._id;

    return res.status(200).json({
      success: true,
      data: breakdown,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch deduction breakdown",
      error: error.message,
    });
  }
};
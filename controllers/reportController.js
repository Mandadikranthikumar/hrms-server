import mongoose from "mongoose";
import Payroll from "../models/Payroll.js";
import Report from "../models/Report.js";
import Employee from "../models/Employee.js";
import Department from "../models/Department.js";
import Salary from "../models/Salary.js";
import Payslip from "../models/Payslip.js";

const populateEmpConfig = {
  path: "employeeId",
  select: "employee_code designation user_id department_id",
  populate: [
    { path: "user_id", select: "name email" },
    { path: "department_id", select: "departmentId departmentName" },
  ],
};

const shapeReportResponse = (reportDoc) => {
  if (!reportDoc) return null;
  const obj = reportDoc.toObject ? reportDoc.toObject() : { ...reportDoc };
  const empRef = obj.employeeId && typeof obj.employeeId === "object" ? obj.employeeId : null;
  const userRef = empRef?.user_id && typeof empRef.user_id === "object" ? empRef.user_id : null;
  const deptRef = empRef?.department_id && typeof empRef.department_id === "object" ? empRef.department_id : null;

  const empCode = empRef?.employee_code || obj.employeeSnapshot?.employeeCode || "";
  const fullName = userRef?.name || obj.employeeSnapshot?.fullName || "";
  const departmentName = deptRef?.departmentName || obj.department || obj.employeeSnapshot?.department || "";
  const designation = empRef?.designation || obj.employeeSnapshot?.designation || "";
  const email = userRef?.email || "";

  const shapedEmployee = (empRef || empCode || fullName) ? {
    _id: empRef?._id || obj.employeeId || null,
    employeeCode: empCode,
    fullName: fullName,
    department: departmentName,
    designation: designation,
    email: email,
  } : null;

  return {
    _id: obj._id,
    reportType: obj.reportType,
    month: obj.month,
    year: obj.year,
    department: departmentName,
    employee: shapedEmployee,
    summary: obj.summary || {
      totalEmployees: 0,
      totalGrossPay: 0,
      totalDeductions: 0,
      totalNetPay: 0,
    },
    filters: obj.filters || {},
    generatedAt: obj.generatedAt || obj.createdAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
};

// ----------------------------------------------------------
// POST /api/reports/monthly
// ----------------------------------------------------------
export const generateMonthlyReport = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "month and year are required",
      });
    }

    const payrolls = await Payroll.find({
      month: Number(month),
      year: Number(year),
    });

    if (payrolls.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No payroll records found for the selected period.",
        data: null,
      });
    }

    const summary = payrolls.reduce(
      (acc, p) => {
        acc.totalEmployees += 1;
        acc.totalGrossPay += p.grossSalary || 0;
        acc.totalDeductions += p.deductions || 0;
        acc.totalNetPay += p.netSalary || 0;
        return acc;
      },
      { totalEmployees: 0, totalGrossPay: 0, totalDeductions: 0, totalNetPay: 0 }
    );

    const report = await Report.create({
      reportType: "monthly",
      month: Number(month),
      year: Number(year),
      summary,
      filters: { month, year },
      generatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Monthly report generated successfully",
      data: shapeReportResponse(report),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate monthly report",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// POST /api/reports/yearly
// ----------------------------------------------------------
export const generateYearlyReport = async (req, res) => {
  try {
    const { year } = req.body;

    if (!year) {
      return res.status(400).json({
        success: false,
        message: "year is required",
      });
    }

    const payrolls = await Payroll.find({ year: Number(year) });

    if (payrolls.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No payroll records found for the selected year.",
        data: null,
      });
    }

    const summary = payrolls.reduce(
      (acc, p) => {
        acc.totalEmployees += 1;
        acc.totalGrossPay += p.grossSalary || 0;
        acc.totalDeductions += p.deductions || 0;
        acc.totalNetPay += p.netSalary || 0;
        return acc;
      },
      { totalEmployees: 0, totalGrossPay: 0, totalDeductions: 0, totalNetPay: 0 }
    );

    const report = await Report.create({
      reportType: "yearly",
      year: Number(year),
      summary,
      filters: { year },
      generatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Yearly report generated successfully",
      data: shapeReportResponse(report),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate yearly report",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// POST /api/reports/employee
// Validate employee existence in Employee collection before generating
// ----------------------------------------------------------
export const generateEmployeeReport = async (req, res) => {
  try {
    const { employeeId } = req.body;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "employeeId is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID format",
      });
    }

    const empObj = await Employee.findById(employeeId).populate([
      { path: "user_id", select: "name email" },
      { path: "department_id", select: "departmentId departmentName" },
    ]);

    if (!empObj) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const payrolls = await Payroll.find({ employeeId }).sort({
      year: -1,
      month: -1,
    });

    if (payrolls.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No payroll records found for this employee.",
        data: null,
      });
    }

    const summary = payrolls.reduce(
      (acc, p) => {
        acc.totalEmployees = 1;
        acc.totalGrossPay += p.grossSalary || 0;
        acc.totalDeductions += p.deductions || 0;
        acc.totalNetPay += p.netSalary || 0;
        return acc;
      },
      { totalEmployees: 0, totalGrossPay: 0, totalDeductions: 0, totalNetPay: 0 }
    );

    const report = await Report.create({
      reportType: "employee",
      employeeId,
      summary,
      filters: { employeeId },
      generatedBy: req.user?._id || null,
    });

    const populatedReport = await Report.findById(report._id).populate(populateEmpConfig);

    return res.status(201).json({
      success: true,
      message: "Employee report generated successfully",
      data: shapeReportResponse(populatedReport),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate employee report",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// POST /api/reports/department
// ----------------------------------------------------------
export const generateDepartmentReport = async (req, res) => {
  try {
    const { department, month, year } = req.body;

    if (!department) {
      return res.status(400).json({
        success: false,
        message: "department is required",
      });
    }

    // 1. Find matching Department document from MongoDB Department collection
    let deptObj = await Department.findOne({
      $or: [
        { departmentName: { $regex: new RegExp(`^${department}$`, "i") } },
        { departmentId: department },
        { _id: mongoose.Types.ObjectId.isValid(department) ? department : null },
      ],
    });

    const searchDeptName = deptObj ? deptObj.departmentName : department;

    // 2. Build multi-condition match filters
    const matchFilters = [];
    if (deptObj) {
      matchFilters.push({ "employee.department_id": deptObj._id });
    }
    matchFilters.push({ "department.departmentName": { $regex: new RegExp(`^${searchDeptName}$`, "i") } });
    matchFilters.push({ "employeeSnapshot.department": { $regex: new RegExp(`^${searchDeptName}$`, "i") } });

    const pipeline = [
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
        $match: {
          $or: matchFilters,
          ...(month ? { month: Number(month) } : {}),
          ...(year ? { year: Number(year) } : {}),
        },
      },
    ];

    const payrolls = await Payroll.aggregate(pipeline);

    if (payrolls.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No payroll records found for the selected department.",
        data: null,
      });
    }

    const summary = payrolls.reduce(
      (acc, p) => {
        acc.totalEmployees += 1;
        acc.totalGrossPay += p.grossSalary || 0;
        acc.totalDeductions += p.deductions || 0;
        acc.totalNetPay += p.netSalary || 0;
        return acc;
      },
      { totalEmployees: 0, totalGrossPay: 0, totalDeductions: 0, totalNetPay: 0 }
    );

    const report = await Report.create({
      reportType: "department",
      department,
      month: month ? Number(month) : null,
      year: year ? Number(year) : null,
      summary,
      filters: { department, month, year },
      generatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Department report generated successfully",
      data: shapeReportResponse(report),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate department report",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// GET /api/reports/:id
// ----------------------------------------------------------
export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id).populate(populateEmpConfig);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: shapeReportResponse(report),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch report",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// GET /api/reports
// ----------------------------------------------------------
export const getAllReports = async (req, res) => {
  try {
    const { reportType } = req.query;

    const query = {};
    if (reportType) query.reportType = reportType;

    const reports = await Report.find(query)
      .populate(populateEmpConfig)
      .sort({ createdAt: -1 });

    const shaped = reports
      .filter((r) => {
        if (r.reportType === "employee" && (!r.employeeId || typeof r.employeeId !== "object")) {
          return false;
        }
        return true;
      })
      .map(shapeReportResponse);

    return res.status(200).json({
      success: true,
      count: shaped.length,
      data: shaped,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// GET /api/reports/:id/export
// ----------------------------------------------------------
export const exportReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id).populate(populateEmpConfig);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const shaped = shapeReportResponse(report);
    const empCode = shaped.employee?.employeeCode || "-";
    const empName = shaped.employee?.fullName || "-";

    const rows = [
      ["Field", "Value"],
      ["Report Type", report.reportType],
      ["Month", report.month ?? "-"],
      ["Year", report.year ?? "-"],
      ["Department", report.department ?? "-"],
      ["Employee Code", empCode],
      ["Employee Name", empName],
      ["Total Employees", report.summary?.totalEmployees || 0],
      ["Total Gross Pay", report.summary?.totalGrossPay || 0],
      ["Total Deductions", report.summary?.totalDeductions || 0],
      ["Total Net Pay", report.summary?.totalNetPay || 0],
      ["Generated At", (report.generatedAt || report.createdAt).toISOString()],
    ];

    const csvContent = rows.map((row) => row.join(",")).join("\n");
    const fileName = `report-${report.reportType}-${id}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    return res.status(200).send(csvContent);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to export report",
      error: error.message,
    });
  }
};

// ----------------------------------------------------------
// DELETE /api/reports/reset
// ----------------------------------------------------------
export const resetTeam4Data = async (req, res) => {
  try {
    const activeEmployees = await Employee.find().select("_id");
    const validEmpIds = activeEmployees.map((e) => e._id);

    const [payrollDel, salaryDel, reportDel, payslipDel] = await Promise.all([
      Payroll.deleteMany({ employeeId: { $nin: validEmpIds } }),
      Salary.deleteMany({ employeeId: { $nin: validEmpIds } }),
      Report.deleteMany({}),
      Payslip.deleteMany({ employeeId: { $nin: validEmpIds } }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Team 4 data reset and cleaned successfully.",
      data: {
        deletedPayrollOrphans: payrollDel.deletedCount,
        deletedSalaryOrphans: salaryDel.deletedCount,
        deletedReports: reportDel.deletedCount,
        deletedPayslipOrphans: payslipDel.deletedCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to reset Team 4 data",
      error: error.message,
    });
  }
};
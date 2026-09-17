import PDFDocument from "pdfkit";
import Payroll from "../models/Payroll.js";
import Salary from "../models/Salary.js";
import Employee from "../models/Employee.js";
import { calculatePayroll } from "../services/payrollService.js";

const populateEmployee = {
  path: 'employeeId',
  select: 'employee_code designation user_id department_id',
  populate: [
    { path: 'user_id', select: 'name email' },
    { path: 'department_id', select: 'departmentId departmentName' },
  ],
};

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const generatePayroll = async (req, res) => {
  try {
    const {
      employeeId,
      month,
      year,
      daysPresent,
      totalWorkingDays,
      bonus = 0,
    } = req.body;

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    const monthLabel = `${monthNames[monthNum - 1] || month} ${yearNum}`;

    const existingPayroll = await Payroll.findOne({ employeeId, month: monthNum, year: yearNum });

    if (existingPayroll) {
      return res.status(409).json({
        success: false,
        message: `Salary already exists for this employee for ${monthLabel}.`,
      });
    }

    const activeSalary = await Salary.findOne({ employeeId, isActive: true });

    if (!activeSalary) {
      return res.status(404).json({
        success: false,
        message: "No active salary structure found for this employee.",
      });
    }

    const empObj = await Employee.findById(employeeId).populate([
      { path: 'user_id', select: 'name email' },
      { path: 'department_id', select: 'departmentId departmentName' }
    ]);

    const snapshot = {
      employeeCode: empObj?.employee_code || '',
      fullName: empObj?.user_id?.name || '',
      department: empObj?.department_id?.departmentName || '',
      designation: empObj?.designation || '',
    };

    const calculated = calculatePayroll({
      basicSalary: activeSalary.basicSalary,
      hra: activeSalary.hra,
      allowances: activeSalary.allowances,
      deductions: activeSalary.deductions,
      bonus,
      daysPresent,
      totalWorkingDays,
    });

    const payroll = await Payroll.create({
      employeeId,
      salaryId: activeSalary._id,
      month,
      year,
      daysPresent,
      totalWorkingDays,
      basicSalary: activeSalary.basicSalary,
      hra: activeSalary.hra,
      allowances: activeSalary.allowances,
      deductions: activeSalary.deductions,
      bonus,
      grossSalary: calculated.grossSalary,
      netSalary: calculated.netSalary,
      status: "Generated",
      generatedBy: req.user?._id || null,
      employeeSnapshot: snapshot,
    });

    const populatedPayroll = await Payroll.findById(payroll._id).populate(populateEmployee);

    return res.status(201).json({
      success: true,
      message: "Payroll generated successfully",
      data: populatedPayroll,
    });
  } catch (error) {
    console.error("Generate Payroll Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAllPayrolls = async (req, res) => {
  try {
    const userRole = (req.user?.role || '').toLowerCase();
    const isSuperAdmin = userRole === 'super_admin' || userRole === 'superadmin';
    let query = {};

    if (!isSuperAdmin) {
      const isEmployee = userRole === 'employee';
      if (isEmployee || req.query?.scope === 'my' || req.query?.my === 'true') {
        const userId = req.user._id || req.user.id;
        let myEmp = await Employee.findOne({ user_id: userId });
        if (!myEmp && req.user.email) {
          const userRecord = await Employee.base.model("Employees").findOne({ email: req.user.email });
          if (userRecord) {
            myEmp = await Employee.findOne({ user_id: userRecord._id });
          }
        }
        if (!myEmp) {
          return res.status(200).json({ success: true, count: 0, data: [] });
        }
        query.employeeId = myEmp._id;
      } else {
        if (!req.user?.organizationId) {
          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
          });
        }

        if (req.query?.scope === 'employees') {
          // HR / Admin viewing employees only: exclude HR's own record from the list
          const userId = req.user._id || req.user.id;
          let myEmp = await Employee.findOne({ user_id: userId });
          if (!myEmp && req.user.email) {
            const userRecord = await Employee.base.model("Employees").findOne({ email: req.user.email });
            if (userRecord) {
              myEmp = await Employee.findOne({ user_id: userRecord._id });
            }
          }

          const filter = { organizationId: req.user.organizationId };
          if (myEmp) {
            filter._id = { $ne: myEmp._id };
          }
          const orgEmps = await Employee.find(filter).select("_id");
          query.employeeId = { $in: orgEmps.map((e) => e._id) };
        } else {
          // HR / Org Admin default: see all employees in their organization PLUS their own employee record
          const orgEmps = await Employee.find({
            $or: [
              { organizationId: req.user.organizationId },
              { user_id: req.user._id || req.user.id }
            ]
          }).select("_id");
          query.employeeId = { $in: orgEmps.map((e) => e._id) };
        }
      }
    } else if (req.query?.organizationId) {
      const orgEmps = await Employee.find({ organizationId: req.query.organizationId }).select("_id");
      query.employeeId = { $in: orgEmps.map((e) => e._id) };
    }

    const payrolls = await Payroll.find(query)
      .populate(populateEmployee)
      .sort({ year: -1, month: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: payrolls.length,
      data: payrolls,
    });
  } catch (error) {
    console.error("getAllPayrolls Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong fetching payroll records",
      error: error.message,
    });
  }
};

export const getPayrollsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const userRole = (req.user?.role || '').toLowerCase();
    const isSuperAdmin = userRole === 'super_admin' || userRole === 'superadmin';

    if (!isSuperAdmin) {
      const targetEmp = await Employee.findById(employeeId);
      if (!targetEmp) {
        return res.status(404).json({ success: false, message: "Employee not found" });
      }
      const isOwnRecord = String(targetEmp.user_id) === String(req.user?._id || req.user?.id);
      const isSameOrg = req.user?.organizationId && String(targetEmp.organizationId) === String(req.user.organizationId);
      if (!isOwnRecord && !isSameOrg) {
        return res.status(403).json({ success: false, message: "Access denied: unauthorized organization" });
      }
    }

    const payrolls = await Payroll.find({ employeeId })
      .populate(populateEmployee)
      .sort({ year: -1, month: -1, createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: payrolls,
    });
  } catch (error) {
    console.error("getPayrollsByEmployee Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong fetching payroll records",
      error: error.message,
    });
  }
};

export const getPayrollById = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = (req.user?.role || '').toLowerCase();
    const isSuperAdmin = userRole === 'super_admin' || userRole === 'superadmin';

    const payroll = await Payroll.findById(id).populate(populateEmployee);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (!isSuperAdmin) {
      const emp = await Employee.findById(payroll.employeeId?._id || payroll.employeeId);
      const isOwnRecord = emp && String(emp.user_id) === String(req.user?._id || req.user?.id);
      const isSameOrg = emp && req.user?.organizationId && String(emp.organizationId) === String(req.user.organizationId);
      if (!isOwnRecord && !isSameOrg) {
        return res.status(403).json({ success: false, message: "Access denied: unauthorized organization" });
      }
    }

    return res.status(200).json({
      success: true,
      data: payroll,
    });
  } catch (error) {
    console.error("getPayrollById Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong fetching payroll record",
      error: error.message,
    });
  }
};

export const markPayrollAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = (req.user?.role || '').toLowerCase();
    const isSuperAdmin = userRole === 'super_admin' || userRole === 'superadmin';

    const payroll = await Payroll.findById(id);

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    if (!isSuperAdmin) {
      const emp = await Employee.findById(payroll.employeeId);
      const isSameOrg = emp && req.user?.organizationId && String(emp.organizationId) === String(req.user.organizationId);
      if (!isSameOrg) {
        return res.status(403).json({ success: false, message: "Access denied: unauthorized organization" });
      }
    }

    if (payroll.status === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Payroll is already marked as paid",
      });
    }

    payroll.status = "Paid";
    payroll.paymentDate = new Date();
    await payroll.save();

    const populatedPayroll = await Payroll.findById(payroll._id).populate(populateEmployee);

    return res.status(200).json({
      success: true,
      message: "Payroll marked as paid successfully",
      data: populatedPayroll,
    });
  } catch (error) {
    console.error("markPayrollAsPaid Error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong updating payroll status",
      error: error.message,
    });
  }
};

// =====================================================
// Download payslip PDF directly from a Payroll record
// GET /api/payrolls/:id/download
// =====================================================
export const downloadPayrollPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const userRole = (req.user?.role || '').toLowerCase();
    const isSuperAdmin = userRole === 'super_admin' || userRole === 'superadmin';

    const payroll = await Payroll.findById(id).populate(populateEmployee);

    if (!payroll) {
      return res.status(404).json({ success: false, message: "Payroll record not found" });
    }

    if (!isSuperAdmin) {
      const empDoc = await Employee.findById(payroll.employeeId?._id || payroll.employeeId);
      const isOwnRecord = empDoc && String(empDoc.user_id) === String(req.user?._id || req.user?.id);
      const isSameOrg = empDoc && req.user?.organizationId && String(empDoc.organizationId) === String(req.user.organizationId);
      if (!isOwnRecord && !isSameOrg) {
        return res.status(403).json({ success: false, message: "Access denied: unauthorized organization" });
      }
    }

    const emp = payroll.employeeId;
    const snap = payroll.employeeSnapshot || {};

    const empCode = (emp && emp.employee_code) ? emp.employee_code : (snap.employeeCode || String(payroll.employeeId));
    const empName = (emp && emp.user_id && emp.user_id.name) ? emp.user_id.name : (snap.fullName || '');
    const empDesig = (emp && emp.designation) ? emp.designation : (snap.designation || '');
    const empDept = (emp && emp.department_id && emp.department_id.departmentName) ? emp.department_id.departmentName : (snap.department || '');

    const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthStr = MONTH_NAMES[payroll.month] || String(payroll.month);
    const fileName = `payslip-${empCode}-${monthStr}-${payroll.year}.pdf`;

    const doc = new PDFDocument({ margin: 0, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    doc.pipe(res);

    const primary = '#6C5CE7';
    const primaryDark = '#5847D0';
    const lightGray = '#F5F4FB';
    const midGray = '#6B7280';
    const green = '#27AE60';
    const red = '#E74C3C';
    const pageWidth = doc.page.width;
    const marginX = 50;
    const contentWidth = pageWidth - marginX * 2;

    // Header Band
    doc.rect(0, 0, pageWidth, 90).fill(primary);
    doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text('PAYSLIP', marginX, 28);
    doc.fontSize(10).font('Helvetica').fillColor('#D6E0EE')
      .text(`Pay Period: ${monthStr} ${payroll.year}`, marginX, 56)
      .text(`Status: ${payroll.status}`, marginX + 220, 56);

    let y = 110;

    // Employee Info Box
    doc.roundedRect(marginX, y, contentWidth, 84, 4).fill(lightGray);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(11).text('EMPLOYEE DETAILS', marginX + 15, y + 12);
    doc.font('Helvetica').fontSize(10).fillColor('#333333')
      .text(`Code: ${empCode}`, marginX + 15, y + 34)
      .text(`Name: ${empName}`, marginX + 15, y + 52)
      .text(`Designation: ${empDesig}`, marginX + contentWidth / 2, y + 34)
      .text(`Department: ${empDept}`, marginX + contentWidth / 2, y + 52);
    y += 104;

    // Attendance Strip
    doc.roundedRect(marginX, y, contentWidth, 30, 4).fill('#EEF2FF');
    doc.fillColor('#3730A3').font('Helvetica-Bold').fontSize(10)
      .text(`Attendance: ${payroll.daysPresent} present out of ${payroll.totalWorkingDays} working days`, marginX + 15, y + 10);
    y += 46;

    const drawSectionHeader = (title, color) => {
      doc.rect(marginX, y, contentWidth, 24).fill(color);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11).text(title, marginX + 12, y + 6);
      y += 24;
    };

    let rowAlt = false;
    const drawRow = (label, value) => {
      if (rowAlt) doc.rect(marginX, y, contentWidth, 22).fill(lightGray);
      doc.fillColor('#333333').font('Helvetica').fontSize(10)
        .text(label, marginX + 12, y + 6)
        .text(`\u20B9 ${Number(value || 0).toLocaleString('en-IN')}`, marginX, y + 6, { width: contentWidth - 12, align: 'right' });
      y += 22;
      rowAlt = !rowAlt;
    };

    // Earnings
    drawSectionHeader('EARNINGS', green);
    rowAlt = false;
    drawRow('Basic Salary', payroll.basicSalary);
    drawRow('HRA (House Rent Allowance)', payroll.hra);
    drawRow('Special Allowances', payroll.allowances);
    drawRow('Bonus', payroll.bonus);

    doc.rect(marginX, y, contentWidth, 24).fillAndStroke(lightGray, '#E0E0E0');
    doc.fillColor(green).font('Helvetica-Bold').fontSize(10)
      .text('Gross Salary', marginX + 12, y + 7)
      .text(`\u20B9 ${Number(payroll.grossSalary || 0).toLocaleString('en-IN')}`, marginX, y + 7, { width: contentWidth - 12, align: 'right' });
    y += 40;

    // Deductions
    drawSectionHeader('DEDUCTIONS', red);
    rowAlt = false;
    drawRow('Total Deductions', payroll.deductions);

    doc.rect(marginX, y, contentWidth, 24).fillAndStroke(lightGray, '#E0E0E0');
    doc.fillColor(red).font('Helvetica-Bold').fontSize(10)
      .text('Total Deductions', marginX + 12, y + 7)
      .text(`\u20B9 ${Number(payroll.deductions || 0).toLocaleString('en-IN')}`, marginX, y + 7, { width: contentWidth - 12, align: 'right' });
    y += 45;

    // Net Pay Banner
    doc.roundedRect(marginX, y, contentWidth, 50, 4).fill(primaryDark);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14)
      .text('NET PAY', marginX + 15, y + 16)
      .text(`\u20B9 ${Number(payroll.netSalary || 0).toLocaleString('en-IN')}`, marginX, y + 16, { width: contentWidth - 15, align: 'right' });
    y += 68;

    if (payroll.paymentDate) {
      doc.fontSize(9).fillColor(midGray).font('Helvetica')
        .text(`Payment Date: ${new Date(payroll.paymentDate).toLocaleDateString('en-IN')}`, marginX, y);
      y += 16;
    }

    doc.fontSize(8).fillColor(midGray).font('Helvetica')
      .text('This is a system-generated payslip and does not require a signature.', marginX, y + 10, { width: contentWidth, align: 'center' });

    doc.end();
  } catch (error) {
    console.error('downloadPayrollPDF Error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate payslip PDF', error: error.message });
    }
  }
};
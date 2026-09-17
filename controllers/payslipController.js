import PDFDocument from "pdfkit";
import Payslip from "../models/Payslip.js";
import Payroll from "../models/Payroll.js"; // his model — used to generate payslip from real payroll data

export const generatePayslip = async (req, res) => {
  try {
    const { payrollId, employeeName } = req.body;

    if (!payrollId || !employeeName) {
      return res.status(400).json({
        success: false,
        message: "payrollId and employeeName are required",
      });
    }

    const payrollRecord = await Payroll.findById(payrollId);
    if (!payrollRecord) {
      return res.status(404).json({
        success: false,
        message: "Payroll record not found",
      });
    }

    // Map his Payroll fields into your Payslip schema
    const basic = payrollRecord.earnings.basicSalary || 0;
    const hra = payrollRecord.earnings.hra || 0;
    const allowances = payrollRecord.earnings.allowances || 0;
    const bonus = 0; // not tracked in his Payroll model

    const grossPay = basic + hra + allowances + bonus;

    const tax = 0;
    const providentFund = 0;
    const insurance = 0;
    const other = payrollRecord.deductions || 0; // his single deductions value

    const totalDeductions = tax + providentFund + insurance + other;
    const netPay = grossPay - totalDeductions;

    const payslip = await Payslip.create({
      employeeId: payrollRecord.employeeId,
      employeeName,
      month: payrollRecord.month,
      year: payrollRecord.year,
      earnings: { basic, hra, allowances, bonus },
      deductions: { tax, providentFund, insurance, other },
      grossPay,
      totalDeductions,
      netPay,
      generatedBy: req.user?._id || null,
    });

    return res.status(201).json({
      success: true,
      message: "Payslip generated successfully",
      data: payslip,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Payslip already exists for this employee in the given month/year",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to generate payslip",
      error: error.message,
    });
  }
};

const populateEmployeeConfig = {
  path: "employeeId",
  select: "employee_code designation user_id department_id",
  populate: [
    { path: "user_id", select: "name email" },
    { path: "department_id", select: "departmentId departmentName" },
  ],
};

export const getPayslipById = async (req, res) => {
  try {
    const { id } = req.params;
    const payslip = await Payslip.findById(id).populate(populateEmployeeConfig);

    if (!payslip) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: payslip,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payslip",
      error: error.message,
    });
  }
};

export const getPayslipsByEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { year } = req.query;

    const query = { employeeId };
    if (year) query.year = Number(year);

    const payslips = await Payslip.find(query)
      .populate(populateEmployeeConfig)
      .sort({ year: -1, month: -1 });

    return res.status(200).json({
      success: true,
      count: payslips.length,
      data: payslips,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payslips",
      error: error.message,
    });
  }
};

export const updatePayslipStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["generated", "sent", "downloaded"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${allowedStatuses.join(", ")}`,
      });
    }

    const payslip = await Payslip.findByIdAndUpdate(
      id,
      { status },
      { returnDocument: true }
    );

    if (!payslip) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payslip status updated",
      data: payslip,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update payslip status",
      error: error.message,
    });
  }
};

export const downloadPayslipPDF = async (req, res) => {
  try {
    const { id } = req.params;
    // TODO: re-add .populate("employeeId", "name email department") once Employee model is merged in
    const payslip = await Payslip.findById(id);

    if (!payslip) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found",
      });
    }

    const doc = new PDFDocument({ margin: 0, size: "A4" });
    const fileName = `payslip-${payslip.month}-${payslip.year}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    doc.pipe(res);

    // ---- Colors (matched to app's purple/indigo theme) ----
    const primary = "#6C5CE7";      // main purple/indigo
    const primaryDark = "#5847D0";  // darker shade for banners
    const lightGray = "#F5F4FB";    // soft lavender background
    const midGray = "#6B7280";
    const green = "#27AE60";        // for earnings/positive
    const red = "#E74C3C";          // for deductions
    const pageWidth = doc.page.width;
    const marginX = 50;
    const contentWidth = pageWidth - marginX * 2;

    // ---- Header band ----
    doc.rect(0, 0, pageWidth, 90).fill(primary);
    doc
      .fillColor("#FFFFFF")
      .fontSize(22)
      .font("Helvetica-Bold")
      .text("PAYSLIP", marginX, 30);
    doc
      .fontSize(10)
      .font("Helvetica")
      .fillColor("#D6E0EE")
      .text(`Pay Period: ${payslip.month}/${payslip.year}`, marginX, 58);

    let y = 115;

    // ---- Employee info box ----
    doc.roundedRect(marginX, y, contentWidth, 70, 4).fill(lightGray);
    doc
      .fillColor(primary)
      .font("Helvetica-Bold")
      .fontSize(11)
      .text("EMPLOYEE DETAILS", marginX + 15, y + 12);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#333333")
      .text(`Name: ${payslip.employeeName}`, marginX + 15, y + 32)
      .text(`Employee ID: ${payslip.employeeId}`, marginX + 15, y + 48);

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(midGray)
      .text(`Status: ${payslip.status}`, marginX + contentWidth / 2, y + 32)
      .text(
        `Generated: ${new Date(payslip.createdAt).toLocaleDateString()}`,
        marginX + contentWidth / 2,
        y + 48
      );

    y += 100;

    // ---- Helper to draw a section table ----
    const drawSectionHeader = (title, color) => {
      doc.rect(marginX, y, contentWidth, 24).fill(color);
      doc
        .fillColor("#FFFFFF")
        .font("Helvetica-Bold")
        .fontSize(11)
        .text(title, marginX + 12, y + 6);
      y += 24;
    };

    const drawRow = (label, value, isAlt) => {
      if (isAlt) {
        doc.rect(marginX, y, contentWidth, 22).fill(lightGray);
      }
      doc
        .fillColor("#333333")
        .font("Helvetica")
        .fontSize(10)
        .text(label, marginX + 12, y + 6)
        .text(
          `Rs. ${value.toLocaleString("en-IN")}`,
          marginX,
          y + 6,
          { width: contentWidth - 12, align: "right" }
        );
      y += 22;
    };

    // ---- Earnings table ----
    drawSectionHeader("EARNINGS", green);
    drawRow("Basic", payslip.earnings.basic, false);
    drawRow("HRA", payslip.earnings.hra, true);
    drawRow("Allowances", payslip.earnings.allowances, false);
    drawRow("Bonus", payslip.earnings.bonus, true);
    doc.rect(marginX, y, contentWidth, 24).fillAndStroke(lightGray, "#E0E0E0");
    doc
      .fillColor(green)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Gross Pay", marginX + 12, y + 7)
      .text(`Rs. ${payslip.grossPay.toLocaleString("en-IN")}`, marginX, y + 7, {
        width: contentWidth - 12,
        align: "right",
      });
    y += 40;

    // ---- Deductions table ----
    drawSectionHeader("DEDUCTIONS", red);
    drawRow("Tax", payslip.deductions.tax, false);
    drawRow("Provident Fund", payslip.deductions.providentFund, true);
    drawRow("Insurance", payslip.deductions.insurance, false);
    drawRow("Other", payslip.deductions.other, true);
    doc.rect(marginX, y, contentWidth, 24).fillAndStroke(lightGray, "#E0E0E0");
    doc
      .fillColor(red)
      .font("Helvetica-Bold")
      .fontSize(10)
      .text("Total Deductions", marginX + 12, y + 7)
      .text(
        `Rs. ${payslip.totalDeductions.toLocaleString("en-IN")}`,
        marginX,
        y + 7,
        { width: contentWidth - 12, align: "right" }
      );
    y += 45;

    // ---- Net pay banner ----
    doc.roundedRect(marginX, y, contentWidth, 45, 4).fill(primaryDark);
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(13)
      .text("NET PAY", marginX + 15, y + 15)
      .text(
        `Rs. ${payslip.netPay.toLocaleString("en-IN")}`,
        marginX,
        y + 15,
        { width: contentWidth - 15, align: "right" }
      );

    y += 70;

    // ---- Footer ----
    doc
      .fontSize(8)
      .fillColor(midGray)
      .font("Helvetica")
      .text(
        "This is a system-generated payslip and does not require a signature.",
        marginX,
        y,
        { width: contentWidth, align: "center" }
      );

    doc.end();

    payslip.status = "downloaded";
    await payslip.save();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to generate payslip PDF",
      error: error.message,
    });
  }
};

export const getAllPayslips = async (req, res) => {
  try {
    const { month, year, status, employeeId } = req.query;

    const query = {};
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);
    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;

    const payslips = await Payslip.find(query).sort({ year: -1, month: -1 });

    return res.status(200).json({
      success: true,
      count: payslips.length,
      data: payslips,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payslips",
      error: error.message,
    });
  }
};

export const deletePayslip = async (req, res) => {
  try {
    const { id } = req.params;

    const payslip = await Payslip.findById(id);
    if (!payslip) {
      return res.status(404).json({
        success: false,
        message: "Payslip not found",
      });
    }

    if (payslip.status === "downloaded" || payslip.status === "sent") {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a payslip that has already been ${payslip.status}`,
      });
    }

    await Payslip.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: "Payslip deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete payslip",
      error: error.message,
    });
  }
};
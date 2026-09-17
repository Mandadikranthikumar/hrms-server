import Employee from "../models/Employee.js";
import User from "../models/UserModel.js";
import Payroll from "../models/Payroll.js";
import Organization from "../models/Organization.js";
import Department from "../models/Department.js";
import { createNotification, sendEmail } from "../services/notificationService.js";

const MONTH_NAMES = [
  "",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const formatAccountNumber = (acc, phone) => {
  if (acc && String(acc).trim()) {
    const clean = String(acc).trim();
    if (clean.startsWith("XXXX")) return clean;
    return `XXXX${clean.slice(-4)}`;
  }
  if (phone && String(phone).trim()) {
    return `XXXX${String(phone).trim().slice(-4)}`;
  }
  return "XXXX6787";
};

const calculateBonusCooldown = (lastBonusDate) => {
  if (!lastBonusDate) {
    return {
      isBonusEligible: true,
      remainingMonths: 0,
      cooldownText: "Active (Eligible)",
    };
  }

  const last = new Date(lastBonusDate);
  const now = new Date();
  const monthsPassed = (now.getFullYear() - last.getFullYear()) * 12 + (now.getMonth() - last.getMonth());
  const remainingMonths = 12 - monthsPassed;

  if (remainingMonths <= 0) {
    return {
      isBonusEligible: true,
      remainingMonths: 0,
      cooldownText: "Active (Eligible)",
    };
  }

  return {
    isBonusEligible: false,
    remainingMonths,
    cooldownText: `Locked (Active in ${remainingMonths} ${remainingMonths === 1 ? "month" : "months"})`,
  };
};

const sendSalaryCreditedEmail = async ({
  to,
  employeeName,
  employeeRole,
  employeeCode,
  organizationName,
  accountNumber,
  amount,
  monthName,
  year,
  transactionRef,
}) => {
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #4f46e5;">
        <h2 style="color: #4f46e5; margin: 0; font-size: 22px;">Salary Credited Successfully</h2>
        <p style="color: #64748b; margin: 6px 0 0; font-size: 14px;">Payroll Credit Confirmation — ${organizationName}</p>
      </div>

      <p style="font-size: 15px; color: #1e293b; margin-top: 20px;">Dear <strong>${employeeName}</strong>,</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.6;">
        Your monthly salary for <strong>${monthName} ${year}</strong> has been credited to your bank account. Transaction details are provided below:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569; width: 40%;">Employee ID:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600;">${employeeCode}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Employee Name:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${employeeName} (${employeeRole})</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Organization:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600;">${organizationName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Bank Account:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: monospace; font-size: 15px; font-weight: bold;">${accountNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Salary Month:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a;">${monthName} ${year}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Amount Credited:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #16a34a; font-size: 18px; font-weight: bold;">₹${amount.toLocaleString("en-IN")}/-</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #475569;">Status:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #16a34a; font-weight: bold;">Credited / Sent</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: bold; color: #475569;">Transaction Ref:</td>
          <td style="padding: 10px 14px; color: #64748b; font-family: monospace; font-size: 12px;">${transactionRef}</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 24px;">
        This is an automated salary confirmation sent from the Super Admin HRMS Portal.
      </p>
    </div>
  `;

  const recipientList = new Set();
  if (to && String(to).trim()) recipientList.add(String(to).trim().toLowerCase());
  if (process.env.EMAIL && String(process.env.EMAIL).trim()) recipientList.add(String(process.env.EMAIL).trim().toLowerCase());
  if (superAdminEmail && String(superAdminEmail).trim()) recipientList.add(String(superAdminEmail).trim().toLowerCase());

  for (const recipientEmail of recipientList) {
    try {
      await sendEmail({
        to: recipientEmail,
        subject: `Salary Credited — ${organizationName} (${monthName} ${year})`,
        html,
      });
      console.log(`[Payroll Email] Successfully sent salary credit confirmation to: ${recipientEmail}`);
    } catch (mailErr) {
      console.error(`[Payroll Email] Failed to send email to ${recipientEmail}:`, mailErr.message);
    }
  }
};

const sendBonusCreditedEmail = async ({
  to,
  employeeName,
  employeeRole,
  employeeCode,
  organizationName,
  accountNumber,
  amount,
  transactionRef,
}) => {
  const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background-color: #ffffff;">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #eab308;">
        <h2 style="color: #ca8a04; margin: 0; font-size: 22px;">🎉 Annual Bonus Credited!</h2>
        <p style="color: #64748b; margin: 6px 0 0; font-size: 14px;">Special Recognition from ${organizationName}</p>
      </div>

      <p style="font-size: 15px; color: #1e293b; margin-top: 20px;">Dear <strong>${employeeName}</strong>,</p>
      <p style="font-size: 14px; color: #475569; line-height: 1.6;">
        Congratulations! An annual bonus has been granted by Super Admin and credited directly to your bank account:
      </p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #fefce8; border-radius: 8px; overflow: hidden; border: 1px solid #fef08a;">
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; font-weight: bold; color: #713f12; width: 40%;">Employee ID:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; color: #713f12; font-weight: 600;">${employeeCode}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; font-weight: bold; color: #713f12;">Employee Name:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; color: #713f12;">${employeeName} (${employeeRole})</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; font-weight: bold; color: #713f12;">Organization:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; color: #713f12; font-weight: 600;">${organizationName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; font-weight: bold; color: #713f12;">Bank Account:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; color: #713f12; font-family: monospace; font-size: 15px; font-weight: bold;">${accountNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; font-weight: bold; color: #713f12;">Bonus Amount:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; color: #15803d; font-size: 20px; font-weight: bold;">₹${amount.toLocaleString("en-IN")}/-</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; font-weight: bold; color: #713f12;">Status:</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #fef08a; color: #15803d; font-weight: bold;">Credited / Sent</td>
        </tr>
        <tr>
          <td style="padding: 10px 14px; font-weight: bold; color: #713f12;">Cooldown Policy:</td>
          <td style="padding: 10px 14px; color: #854d0e; font-size: 12px;">Locked for 12 months (Next eligible in 1 year)</td>
        </tr>
      </table>

      <p style="font-size: 13px; color: #64748b; text-align: center; margin-top: 24px;">
        Thank you for your valuable dedication and commitment!
      </p>
    </div>
  `;

  const recipientList = new Set();
  if (to && String(to).trim()) recipientList.add(String(to).trim().toLowerCase());
  if (process.env.EMAIL && String(process.env.EMAIL).trim()) recipientList.add(String(process.env.EMAIL).trim().toLowerCase());
  if (superAdminEmail && String(superAdminEmail).trim()) recipientList.add(String(superAdminEmail).trim().toLowerCase());

  for (const recipientEmail of recipientList) {
    try {
      await sendEmail({
        to: recipientEmail,
        subject: `Annual Bonus Credited — ${organizationName}`,
        html,
      });
      console.log(`[Bonus Email] Successfully sent bonus credit confirmation to: ${recipientEmail}`);
    } catch (mailErr) {
      console.error(`[Bonus Email] Failed to send bonus email to ${recipientEmail}:`, mailErr.message);
    }
  }
};

// ── GET /api/super-admin/payroll ─────────────────────────────────────────────
export const getSuperAdminPayroll = async (req, res) => {
  try {
    const selectedMonth = parseInt(req.query.month) || new Date().getMonth() + 1;
    const selectedYear = parseInt(req.query.year) || new Date().getFullYear();

    // Fetch all employees and HR (exclude SUPER_ADMIN user)
    const allEmployees = await Employee.find()
      .populate("user_id", "name email role phone department")
      .populate("organizationId", "name organizationId")
      .populate("department_id", "name");

    // Filter out Super Admin account from employee payroll list
    const employees = allEmployees.filter((e) => {
      const userRole = (e.user_id?.role || "").toUpperCase();
      return userRole !== "SUPER_ADMIN" && userRole !== "SUPERADMIN";
    });

    // Fetch payroll records for this year
    const yearPayrolls = await Payroll.find({ year: selectedYear, status: "Paid" });

    const records = employees.map((emp) => {
      const u = emp.user_id || {};
      const org = emp.organizationId || {};
      const dept = emp.department_id || {};

      const monthSalary = emp.month_salary || 50000;
      const yearlySalary = monthSalary * 12;

      // Find current month's payroll record
      const currentMonthPayroll = yearPayrolls.find(
        (p) => String(p.employeeId) === String(emp._id) && p.month === selectedMonth
      );
      const isPaidThisMonth = !!currentMonthPayroll;

      // 30-day pay lock calculation:
      // Once pay button is clicked, button does not open for 30 days, status shows "Sending"
      const lastPaymentDate = emp.last_payment_date || currentMonthPayroll?.paymentDate || null;
      let isPayLocked = false;
      let payLockRemainingDays = 0;
      let payLockText = "Pay";

      if (lastPaymentDate) {
        const diffDays = Math.floor((Date.now() - new Date(lastPaymentDate).getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays < 30) {
          isPayLocked = true;
          payLockRemainingDays = 30 - diffDays;
          payLockText = `Paid (Locked: ${payLockRemainingDays} ${payLockRemainingDays === 1 ? "day" : "days"})`;
        }
      }

      if (isPaidThisMonth) {
        isPayLocked = true;
        if (payLockRemainingDays <= 0) {
          payLockText = "Paid";
        }
      }

      // User requirement: "when once pay button click then that btton still doesnot open still 30 days and status shown sending otherwise pending"
      const status = isPayLocked ? "Sending" : "Pending";

      // Calculate total paid in this year
      const empYearPayrolls = yearPayrolls.filter((p) => String(p.employeeId) === String(emp._id));
      const totalPaidThisYear = empYearPayrolls.reduce((sum, p) => sum + (p.netSalary || monthSalary), 0);
      const remainingSalary = Math.max(0, yearlySalary - totalPaidThisYear);
      const monthsPaidCount = empYearPayrolls.length;

      // Bonus Cooldown
      const bonusCooldown = calculateBonusCooldown(emp.last_bonus_date);
      const accountNumber = formatAccountNumber(emp.account_number, u.phone);

      return {
        _id: emp._id,
        userId: u._id,
        employeeCode: emp.employee_code || "EMP---",
        name: u.name || "Unnamed Staff",
        email: u.email || "",
        phone: u.phone || "",
        role: u.role || "Employee",
        designation: emp.designation || "Staff",
        department: dept.name || u.department || "General",
        organizationName: org.name || "Infinetra Technologies",
        organizationId: org._id,
        accountNumber,
        rawAccountNumber: emp.account_number || "XXXX6787",
        ifscCode: emp.ifsc_code || "HDFC0001234",
        bankName: emp.bank_name || "HDFC Bank",
        branch: emp.branch || "Main Branch",
        upiId: emp.upi_id || "",
        monthSalary,
        yearlySalary,
        remainingSalary,
        totalPaidThisYear,
        monthsPaidCount,
        status,
        isPayLocked,
        payLockRemainingDays,
        payLockText,
        lastPaymentDate,
        lastBonusDate: emp.last_bonus_date || null,
        isBonusEligible: bonusCooldown.isBonusEligible,
        bonusCooldownMonths: bonusCooldown.remainingMonths,
        bonusCooldownText: bonusCooldown.cooldownText,
        bonusAmount: monthSalary, // Default bonus is 1 month salary
      };
    });

    // Calculate summary statistics
    const totalSendingAmount = records
      .filter((r) => r.status === "Pending")
      .reduce((sum, r) => sum + r.monthSalary, 0);

    const totalPaidAmount = records
      .filter((r) => r.status === "Sending")
      .reduce((sum, r) => sum + r.monthSalary, 0);

    return res.status(200).json({
      success: true,
      selectedMonth,
      selectedYear,
      monthName: MONTH_NAMES[selectedMonth] || "Current Month",
      totalSendingAmount,
      totalPaidAmount,
      totalEmployees: records.length,
      pendingCount: records.filter((r) => r.status === "Pending").length,
      sentCount: records.filter((r) => r.status === "Sending").length,
      sendingCount: records.filter((r) => r.status === "Sending").length,
      records,
    });
  } catch (err) {
    console.error("getSuperAdminPayroll error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/super-admin/payroll/pay-single ─────────────────────────────────
export const paySingleSalary = async (req, res) => {
  try {
    const { employeeId, month, year, customAmount, customAccountNumber } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "employeeId is required" });
    }

    const targetMonth = parseInt(month) || new Date().getMonth() + 1;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const monthName = MONTH_NAMES[targetMonth] || `Month ${targetMonth}`;

    const emp = await Employee.findById(employeeId)
      .populate("user_id", "name email role phone")
      .populate("organizationId", "name");

    if (!emp) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const u = emp.user_id || {};
    const org = emp.organizationId || {};
    const organizationName = org.name || "Infinetra Technologies";
    const amount = Number(customAmount || req.body.amount) || emp.month_salary || 50000;
    const accountNumber = formatAccountNumber(customAccountNumber || req.body.accountNumber || emp.account_number, u.phone);

    // Update or create payroll record
    let payroll = await Payroll.findOne({
      employeeId: emp._id,
      month: targetMonth,
      year: targetYear,
    });

    const transactionRef = `TXN-SAL-${targetYear}${String(targetMonth).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;

    if (!payroll) {
      payroll = new Payroll({
        employeeId: emp._id,
        month: targetMonth,
        year: targetYear,
        basicSalary: amount,
        grossSalary: amount,
        netSalary: amount,
        daysPresent: 30,
        totalWorkingDays: 30,
        status: "Paid",
        paymentDate: new Date(),
        accountNumber,
        generatedBy: req.user?.id,
        employeeSnapshot: {
          employeeCode: emp.employee_code,
          fullName: u.name,
          designation: emp.designation,
          department: u.department,
        },
      });
    } else {
      payroll.status = "Paid";
      payroll.paymentDate = new Date();
      payroll.netSalary = amount;
      payroll.basicSalary = amount;
      payroll.grossSalary = amount;
      payroll.accountNumber = accountNumber;
    }

    await payroll.save();

    emp.last_payment_date = new Date();
    await emp.save();

    // 1. Create In-App Notification for employee
    const notifMessage = `Your salary of ₹${amount.toLocaleString("en-IN")} for ${monthName} ${targetYear} has been credited to account ${accountNumber} by ${organizationName}.`;

    if (u._id) {
      await createNotification({
        recipient: u._id,
        type: "payroll",
        message: notifMessage,
      });
    }

    // Also notify Super Admin so notification appears in Super Admin bell
    try {
      const superAdminUser =
        (await User.findOne({ email: (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase() })) ||
        (await User.findOne({ role: "SUPER_ADMIN" }));
      const adminRecipient = req.user?.id || req.user?._id || superAdminUser?._id;
      if (adminRecipient && String(adminRecipient) !== String(u._id)) {
        await createNotification({
          recipient: adminRecipient,
          type: "payroll",
          message: `Salary of ₹${amount.toLocaleString("en-IN")} has been credited to ${u.name || "Employee"} (${accountNumber}) by ${organizationName}.`,
        });
      }
    } catch (notifAdminErr) {
      console.error("Super Admin notif error:", notifAdminErr.message);
    }

    // 2. Send email via Nodemailer
    await sendSalaryCreditedEmail({
      to: u.email,
      employeeName: u.name || "Employee",
      employeeRole: u.role || "Staff",
      employeeCode: emp.employee_code || "EMP---",
      organizationName,
      accountNumber,
      amount,
      monthName,
      year: targetYear,
      transactionRef,
    });

    return res.status(200).json({
      success: true,
      message: `Salary of ₹${amount.toLocaleString("en-IN")} credited to ${u.name} successfully.`,
      payroll,
      transactionRef,
    });
  } catch (err) {
    console.error("paySingleSalary error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/super-admin/payroll/pay-bonus ──────────────────────────────────
export const payBonus = async (req, res) => {
  try {
    const { employeeId, customBonusAmount } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: "employeeId is required" });
    }

    const emp = await Employee.findById(employeeId)
      .populate("user_id", "name email role phone")
      .populate("organizationId", "name");

    if (!emp) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    // 12-Month Cooldown Check
    const cooldown = calculateBonusCooldown(emp.last_bonus_date);
    if (!cooldown.isBonusEligible) {
      return res.status(400).json({
        success: false,
        message: `Bonus already paid within the last 12 months. Next bonus available in ${cooldown.remainingMonths} ${cooldown.remainingMonths === 1 ? "month" : "months"}.`,
        remainingMonths: cooldown.remainingMonths,
      });
    }

    const u = emp.user_id || {};
    const org = emp.organizationId || {};
    const organizationName = org.name || "Infinetra Technologies";
    const amount = Number(customBonusAmount || req.body.amount) || emp.month_salary || 50000;
    const accountNumber = formatAccountNumber(emp.account_number, u.phone);
    const transactionRef = `TXN-BNS-${Date.now().toString().slice(-8)}`;

    // Update bonus date and history
    emp.last_bonus_date = new Date();
    if (!emp.bonus_history) emp.bonus_history = [];
    emp.bonus_history.push({
      amount,
      paidAt: new Date(),
      transactionRef,
      note: "Annual Bonus paid by Super Admin",
    });

    await emp.save();

    // 1. Create In-App Notification for employee
    const notifMessage = `Annual bonus of ₹${amount.toLocaleString("en-IN")} has been credited to your account ${accountNumber} by ${organizationName}.`;

    if (u._id) {
      await createNotification({
        recipient: u._id,
        type: "bonus",
        message: notifMessage,
      });
    }

    // Also notify Super Admin
    try {
      const superAdminUser =
        (await User.findOne({ email: (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase() })) ||
        (await User.findOne({ role: "SUPER_ADMIN" }));
      const adminRecipient = req.user?.id || req.user?._id || superAdminUser?._id;
      if (adminRecipient && String(adminRecipient) !== String(u._id)) {
        await createNotification({
          recipient: adminRecipient,
          type: "bonus",
          message: `Annual bonus of ₹${amount.toLocaleString("en-IN")} has been credited to ${u.name || "Employee"} (${accountNumber}) by ${organizationName}. (12-month lock active)`,
        });
      }
    } catch (notifAdminErr) {
      console.error("Super Admin bonus notif error:", notifAdminErr.message);
    }

    // 2. Send email via Nodemailer
    await sendBonusCreditedEmail({
      to: u.email,
      employeeName: u.name || "Employee",
      employeeRole: u.role || "Staff",
      employeeCode: emp.employee_code || "EMP---",
      organizationName,
      accountNumber,
      amount,
      transactionRef,
    });

    return res.status(200).json({
      success: true,
      message: `Annual bonus of ₹${amount.toLocaleString("en-IN")} credited to ${u.name} successfully. Bonus locked for 12 months.`,
      lastBonusDate: emp.last_bonus_date,
      cooldownMonths: 12,
      cooldownText: "Locked (Active in 12 months)",
      transactionRef,
    });
  } catch (err) {
    console.error("payBonus error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/super-admin/payroll/pay-all ────────────────────────────────────
export const payAllSalaries = async (req, res) => {
  try {
    const targetMonth = parseInt(req.body.month) || new Date().getMonth() + 1;
    const targetYear = parseInt(req.body.year) || new Date().getFullYear();
    const monthName = MONTH_NAMES[targetMonth] || `Month ${targetMonth}`;

    const allEmployees = await Employee.find()
      .populate("user_id", "name email role phone department")
      .populate("organizationId", "name");

    const employees = allEmployees.filter((e) => {
      const userRole = (e.user_id?.role || "").toUpperCase();
      return userRole !== "SUPER_ADMIN" && userRole !== "SUPERADMIN";
    });

    // Find who is already paid
    const existingPaid = await Payroll.find({
      month: targetMonth,
      year: targetYear,
      status: "Paid",
    });
    const paidEmployeeIds = new Set(existingPaid.map((p) => String(p.employeeId)));

    const pendingEmployees = employees.filter((e) => !paidEmployeeIds.has(String(e._id)));

    if (pendingEmployees.length === 0) {
      return res.status(200).json({
        success: true,
        message: `All employees have already been paid for ${monthName} ${targetYear}.`,
        paidCount: 0,
        totalAmount: 0,
      });
    }

    let totalAmount = 0;
    const processed = [];

    for (const emp of pendingEmployees) {
      const u = emp.user_id || {};
      const org = emp.organizationId || {};
      const organizationName = org.name || "Infinetra Technologies";
      const amount = emp.month_salary || 50000;
      const accountNumber = formatAccountNumber(emp.account_number, u.phone);
      const transactionRef = `TXN-BULK-${targetYear}${String(targetMonth).padStart(2, "0")}-${Date.now().toString().slice(-6)}`;

      let payroll = await Payroll.findOne({
        employeeId: emp._id,
        month: targetMonth,
        year: targetYear,
      });

      if (!payroll) {
        payroll = new Payroll({
          employeeId: emp._id,
          month: targetMonth,
          year: targetYear,
          basicSalary: amount,
          grossSalary: amount,
          netSalary: amount,
          daysPresent: 30,
          totalWorkingDays: 30,
          status: "Paid",
          paymentDate: new Date(),
          accountNumber,
          generatedBy: req.user?.id,
          employeeSnapshot: {
            employeeCode: emp.employee_code,
            fullName: u.name,
            designation: emp.designation,
            department: u.department,
          },
        });
      } else {
        payroll.status = "Paid";
        payroll.paymentDate = new Date();
        payroll.netSalary = amount;
        payroll.accountNumber = accountNumber;
      }

      await payroll.save();

      emp.last_payment_date = new Date();
      await emp.save();

      totalAmount += amount;
      processed.push({ name: u.name, amount, email: u.email });

      // In-App Notification
      if (u._id) {
        await createNotification({
          recipient: u._id,
          type: "payroll",
          message: `Your salary of ₹${amount.toLocaleString("en-IN")} for ${monthName} ${targetYear} has been credited to account ${accountNumber} by ${organizationName}.`,
        });
      }

      // Email
      await sendSalaryCreditedEmail({
        to: u.email,
        employeeName: u.name || "Employee",
        employeeRole: u.role || "Staff",
        employeeCode: emp.employee_code || "EMP---",
        organizationName,
        accountNumber,
        amount,
        monthName,
        year: targetYear,
        transactionRef,
      });
    }

    // Consolidated email to Super Admin and process.env.EMAIL
    const superAdminRecipients = new Set();
    if (process.env.EMAIL && String(process.env.EMAIL).trim()) {
      superAdminRecipients.add(String(process.env.EMAIL).trim().toLowerCase());
    }
    const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
    if (superAdminEmail) {
      superAdminRecipients.add(superAdminEmail);
    }

    for (const admEmail of superAdminRecipients) {
      try {
        await sendEmail({
          to: admEmail,
          subject: `[HRMS] Bulk Salary Payout Completed — ${monthName} ${targetYear}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px;">
              <h2 style="color: #16a34a; margin-top: 0;">Bulk Salary Payout Successful</h2>
              <p>Total of <strong>${processed.length} employees/HR</strong> were paid for <strong>${monthName} ${targetYear}</strong>.</p>
              <p><strong>Total Amount Dispatched:</strong> <span style="color: #16a34a; font-size: 18px; font-weight: bold;">₹${totalAmount.toLocaleString("en-IN")}/-</span></p>
              <ul style="margin-top: 14px; line-height: 1.6;">
                ${processed.map((p) => `<li><strong>${p.name}:</strong> ₹${p.amount.toLocaleString("en-IN")} (${p.email})</li>`).join("")}
              </ul>
            </div>
          `,
        });
      } catch (e) {
        console.error("Bulk email error:", e.message);
      }
    }

    // In-App Notification for Super Admin
    try {
      const superAdminUser =
        (await User.findOne({ email: (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase() })) ||
        (await User.findOne({ role: "SUPER_ADMIN" }));
      const adminRecipient = req.user?.id || req.user?._id || superAdminUser?._id;
      if (adminRecipient) {
        await createNotification({
          recipient: adminRecipient,
          type: "payroll",
          message: `Batch salary payout completed: ₹${totalAmount.toLocaleString("en-IN")} credited to ${processed.length} employees for ${monthName} ${targetYear}.`,
        });
      }
    } catch (notifErr) {
      console.error("Super admin bulk notif error:", notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: `Successfully processed payroll for ${processed.length} employee(s). Total dispatched: ₹${totalAmount.toLocaleString("en-IN")}/-`,
      paidCount: processed.length,
      totalAmount,
      processed,
    });
  } catch (err) {
    console.error("payAllSalaries error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── PUT /api/super-admin/payroll/config/:employeeId ──────────────────────────
export const updateEmployeePayrollConfig = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const {
      monthSalary,
      month_salary,
      accountNumber,
      account_number,
      ifscCode,
      ifsc_code,
      bankName,
      bank_name,
      branch,
      upiId,
      upi_id,
    } = req.body;

    const emp = await Employee.findById(employeeId);
    if (!emp) {
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const newSalary = monthSalary !== undefined ? monthSalary : month_salary;
    if (newSalary !== undefined && !isNaN(Number(newSalary))) {
      emp.month_salary = Number(newSalary);
    }

    const newAcc = accountNumber !== undefined ? accountNumber : account_number;
    if (newAcc !== undefined) emp.account_number = String(newAcc).trim();

    const newIfsc = ifscCode !== undefined ? ifscCode : ifsc_code;
    if (newIfsc !== undefined) emp.ifsc_code = String(newIfsc).trim().toUpperCase();

    const newBank = bankName !== undefined ? bankName : bank_name;
    if (newBank !== undefined) emp.bank_name = String(newBank).trim();

    if (branch !== undefined) emp.branch = String(branch).trim();

    const newUpi = upiId !== undefined ? upiId : upi_id;
    if (newUpi !== undefined) emp.upi_id = String(newUpi).trim();

    await emp.save();

    return res.status(200).json({
      success: true,
      message: "Employee payroll and banking configuration updated successfully",
      employee: {
        _id: emp._id,
        monthSalary: emp.month_salary,
        yearlySalary: emp.month_salary * 12,
        accountNumber: emp.account_number,
        ifscCode: emp.ifsc_code,
        bankName: emp.bank_name,
        branch: emp.branch,
        upiId: emp.upi_id,
      },
    });
  } catch (err) {
    console.error("updateEmployeePayrollConfig error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
import LeaveBalance from "../models/LeaveBalance.js";

// Helper function to calculate total days between start and end dates (inclusive)
export const calculateLeaveDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Set to start of day UTC/local to ensure exact day difference
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  
  const diffTime = endUtc - startUtc;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  
  return diffDays > 0 ? diffDays : 1;
};

// Get or create default Leave Balance for an employee
export const getOrCreateLeaveBalance = async (employeeId) => {
  let balance = await LeaveBalance.findOne({ employee: employeeId });
  
  if (!balance) {
    balance = await LeaveBalance.create({
      employee: employeeId,
      annualTotal: 20,
      annualUsed: 0,
      annualRemaining: 20,
      sickTotal: 10,
      sickUsed: 0,
      sickRemaining: 10,
      casualTotal: 6,
      casualUsed: 0,
      casualRemaining: 6,
    });
  }
  
  return balance;
};

// Deduct leave balance when leave is approved
export const deductLeaveBalance = async (employeeId, leaveType, days) => {
  const balance = await getOrCreateLeaveBalance(employeeId);

  const type = leaveType?.toLowerCase();

  if (type === "annual") {
    balance.annualUsed += days;
    balance.annualRemaining = Math.max(0, balance.annualTotal - balance.annualUsed);
  } else if (type === "sick") {
    balance.sickUsed += days;
    balance.sickRemaining = Math.max(0, balance.sickTotal - balance.sickUsed);
  } else if (type === "casual") {
    balance.casualUsed += days;
    balance.casualRemaining = Math.max(0, balance.casualTotal - balance.casualUsed);
  }

  await balance.save();
  return balance;
};

// Restore leave balance when approved leave is cancelled
export const restoreLeaveBalance = async (employeeId, leaveType, days) => {
  const balance = await LeaveBalance.findOne({ employee: employeeId });
  if (!balance) return null;

  const type = leaveType?.toLowerCase();

  if (type === "annual") {
    balance.annualUsed = Math.max(0, balance.annualUsed - days);
    balance.annualRemaining = balance.annualTotal - balance.annualUsed;
  } else if (type === "sick") {
    balance.sickUsed = Math.max(0, balance.sickUsed - days);
    balance.sickRemaining = balance.sickTotal - balance.sickUsed;
  } else if (type === "casual") {
    balance.casualUsed = Math.max(0, balance.casualUsed - days);
    balance.casualRemaining = balance.casualTotal - balance.casualUsed;
  }

  await balance.save();
  return balance;
};

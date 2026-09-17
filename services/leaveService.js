import Leave from "../models/Leave.js";
import Employee from "../models/Employee.js";
import {
  deductLeaveBalance,
  restoreLeaveBalance,
  calculateLeaveDays,
} from "./leaveBalanceService.js";

// Apply Leave
export const applyLeaveService = async (leaveData) => {
    const leave = await Leave.create(leaveData);
    return leave;
};

// Helper to attach employee_code to leaves
const enrichLeavesWithEmployeeCode = async (leaves) => {
  if (!leaves || leaves.length === 0) return leaves;
  const userIds = leaves.map(l => l.employee?._id || l.employee).filter(Boolean);
  const emps = await Employee.find({ user_id: { $in: userIds } }).select("user_id employee_code designation").lean();
  const empMap = {};
  emps.forEach(e => {
    empMap[String(e.user_id)] = e;
  });

  return leaves.map(l => {
    const obj = l.toObject ? l.toObject() : { ...l };
    const empUserId = String(obj.employee?._id || obj.employee);
    const emp = empMap[empUserId];
    if (obj.employee && typeof obj.employee === "object") {
      obj.employee.employee_code = emp?.employee_code || "";
      obj.employee.employeeCode = emp?.employee_code || "";
      obj.employee.designation = emp?.designation || "";
    }
    return obj;
  });
};

// Get Own Leave History — returns ONLY the logged-in user's own leaves
export const getLeaveHistoryService = async (userId) => {
  const leaves = await Leave.find({ employee: userId })
    .populate("employee", "name email role")
    .sort({ createdAt: -1 });
  return await enrichLeavesWithEmployeeCode(leaves);
};

// Admin Management — returns ALL employees' leaves for review/approval
export const getAllLeavesAdminService = async () => {
  const leaves = await Leave.find()
    .populate("employee", "name email role")
    .sort({ createdAt: -1 });
  return await enrichLeavesWithEmployeeCode(leaves);
};

// Approve Leave
export const approveLeaveService = async (id) => {
    const leave = await Leave.findById(id);
    if (!leave) {
      throw new Error("Leave request not found");
    }

    if (leave.status !== "Approved") {
      leave.status = "Approved";
      await leave.save();

      const days = calculateLeaveDays(leave.startDate, leave.endDate);
      await deductLeaveBalance(leave.employee, leave.leaveType, days);
    }

    return leave;
};

// Reject Leave (with balance restoration if previously approved)
export const rejectLeaveService = async (id) => {
    const leave = await Leave.findById(id);
    if (!leave) {
      throw new Error("Leave request not found");
    }

    if (leave.status === "Approved") {
      const days = calculateLeaveDays(leave.startDate, leave.endDate);
      await restoreLeaveBalance(leave.employee, leave.leaveType, days);
    }

    leave.status = "Rejected";
    await leave.save();
    return leave;
};

// Cancel Leave
export const cancelLeaveService = async (id) => {
    const leave = await Leave.findById(id);
    if (leave) {
      if (leave.status === "Approved") {
        const days = calculateLeaveDays(leave.startDate, leave.endDate);
        await restoreLeaveBalance(leave.employee, leave.leaveType, days);
      }
      await Leave.findByIdAndDelete(id);
    }
    return true;
};
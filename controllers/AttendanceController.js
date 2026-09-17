import {
  checkInService,
  checkOutService,
  getTodayAttendanceService,
  getAttendanceHistoryService,
  getMonthlyAttendanceService,
  getAttendanceCalendarService,
  getAllAttendanceAdminService,
} from "../services/attendanceService.js";

import User from "../models/UserModel.js";
import Employee from "../models/Employee.js";


// CHECK IN
export const checkIn = async (req, res) => {
  try {
    const employeeId = req.user?._id || req.user?.id;

    if (!employeeId) {
      throw new Error("User authentication failed.");
    }

    const { location, remarks } = req.body;

    const attendance = await checkInService({
      employeeId,
      location,
      remarks,
    });

    res.status(201).json({
      success: true,
      message: "Check In successful.",
      data: attendance,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};



// CHECK OUT
export const checkOut = async (req, res) => {
  try {
    const employeeId = req.user?._id || req.user?.id;

    if (!employeeId) {
      throw new Error("User authentication failed.");
    }

    const attendance = await checkOutService(employeeId);

    res.status(200).json({
      success: true,
      message: "Check Out successful.",
      data: attendance,
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};



// GET TODAY ATTENDANCE
export const getTodayAttendance = async (req, res) => {
  try {
    const employeeId = req.user?._id || req.user?.id;

    if (!employeeId) {
      throw new Error("User authentication failed.");
    }

    const attendance = await getTodayAttendanceService(employeeId);

    res.status(200).json({
      success: true,
      data: attendance,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// GET ATTENDANCE HISTORY
export const getAttendanceHistory = async (req, res) => {
  try {
    const employeeId = req.user?._id || req.user?.id;

    if (!employeeId) {
      throw new Error("User authentication failed.");
    }

    const history = await getAttendanceHistoryService(employeeId);

    res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// GET MONTHLY ATTENDANCE
export const getMonthlyAttendance = async (req, res) => {
  try {
    const employeeId = req.user?._id || req.user?.id;

    if (!employeeId) {
      throw new Error("User authentication failed.");
    }

    const { year, month } = req.params;

    const attendance = await getMonthlyAttendanceService(
      employeeId,
      year,
      month
    );

    res.status(200).json({
      success: true,
      count: attendance.length,
      data: attendance,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};



// GET ATTENDANCE CALENDAR
export const getAttendanceCalendar = async (req, res) => {
  try {
    const employeeId = req.user?._id || req.user?.id;

    if (!employeeId) {
      throw new Error("User authentication failed.");
    }

    const { year, month } = req.params;

    const data = await getAttendanceCalendarService(
      employeeId,
      year,
      month
    );

    res.status(200).json({
      success: true,
      employeeId,
      year,
      month,
      calendar: data,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// GET ALL ATTENDANCE — ADMIN MONITORING
export const getAllAttendanceAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, employeeId } = req.query;

    const records = await getAllAttendanceAdminService({ status, employeeId });

    // Multi-tenant scope: filter records to acting organization
    let scopedRecords = records;
    if (req.user?.organizationId) {
      const orgUsers = await User.find({ organizationId: req.user.organizationId }).select("_id");
      const orgUserIds = new Set(orgUsers.map((u) => String(u._id)));
      scopedRecords = records.filter((r) => orgUserIds.has(String(r.employeeId)));
    }

    // Enrich with user details
    const userIds = [...new Set(scopedRecords.map((r) => r.employeeId))];
    const [users, emps] = await Promise.all([
      User.find({ _id: { $in: userIds } }).select("name email role department").lean(),
      Employee.find({ user_id: { $in: userIds } }).select("user_id employee_code designation").lean(),
    ]);

    const userMap = {};
    users.forEach((u) => {
      userMap[String(u._id)] = u;
    });

    const empMap = {};
    emps.forEach((e) => {
      empMap[String(e.user_id)] = e;
    });

    const enriched = scopedRecords.map((r) => {
      const u = userMap[String(r.employeeId)] || null;
      const emp = empMap[String(r.employeeId)] || null;
      return {
        ...(r.toObject ? r.toObject() : r),
        employee: u
          ? {
              ...u,
              employeeCode: emp?.employee_code || "",
              employee_code: emp?.employee_code || "",
              designation: emp?.designation || "",
            }
          : null,
      };
    });

    return res.status(200).json({
      success: true,
      count: enriched.length,
      data: enriched,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
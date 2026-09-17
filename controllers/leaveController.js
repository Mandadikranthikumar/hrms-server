import Leave from "../models/Leave.js";
import User from "../models/UserModel.js";
import {
  applyLeaveService,
  getLeaveHistoryService,
  getAllLeavesAdminService,
  approveLeaveService,
  rejectLeaveService,
  cancelLeaveService,
} from "../services/leaveService.js";
import { createNotification } from "../services/notificationService.js";
import { sendLeaveEmail } from "../services/notificationService.js";

// Apply Leave
export const applyLeave = async (req, res) => {
  try {
    const leave = await applyLeaveService({
      ...req.body,
      employee: req.user.id,
    });

    // Return successful response immediately after DB operation
    res.status(201).json({
      success: true,
      message: "Leave applied successfully",
      leave,
    });

    // Notify Admin/HR users asynchronously in background without blocking response
    setImmediate(async () => {
      try {
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
        const approvers = await User.find({
          $or: [
            { role: { $in: ["Admin", "HR", "HR Manager", "hr_manager", "hr", "Human Resources", "SUPER_ADMIN", "super_admin"] } },
            { email: superAdminEmail }
          ],
          _id: { $ne: req.user.id },
        }).select("_id email name role");

        const applicant = await User.findById(req.user.id).select("name email role");
        const applicantName = applicant?.name || "An employee";
        const applicantRole = applicant?.role || "Staff";
        const leaveType = req.body.leaveType || "Leave";
        const startDate = req.body.startDate ? new Date(req.body.startDate).toLocaleDateString("en-IN") : "";
        const endDate = req.body.endDate ? new Date(req.body.endDate).toLocaleDateString("en-IN") : "";
        const reason = req.body.reason || "—";

        await Promise.all(
          approvers.map(async (approver) => {
            await createNotification({
              recipient: approver._id,
              type: "leave_applied",
              message: `${applicantName} (${applicantRole}) has applied for ${leaveType} leave (${startDate} – ${endDate}). Reason: ${reason}`,
              relatedLeave: leave._id,
            });

            await sendLeaveEmail({
              to: approver.email,
              subject: `New Leave Request — ${applicantName} (${leaveType})`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <h2 style="color: #4f46e5; margin-top: 0;">New Leave Application</h2>
                  <p><strong>${applicantName}</strong> (${applicantRole}) has submitted a new <strong>${leaveType} leave</strong> request.</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 30%;">Applicant:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${applicantName} (${applicant?.email || ""})</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Leave Type:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${leaveType}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Start Date:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${startDate}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">End Date:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${endDate}</td></tr>
                    <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Reason:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${reason}</td></tr>
                  </table>
                  <p>Please log in to the HRMS portal to review, approve, or reject this request.</p>
                </div>
              `,
            });
          })
        );
      } catch (notifErr) {
        console.error("Async leave apply notification error:", notifErr.message);
      }
    });
    return;
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Get Own Leave History — returns only the logged-in user's own leaves
export const getLeaveHistory = async (req, res) => {
  try {
    const leaves = await getLeaveHistoryService(req.user.id);

    return res.status(200).json({
      success: true,
      leaves,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Get All Leaves — Admin/HR management view (all users' leaves)
export const getAllLeaves = async (req, res) => {
  try {
    const leaves = await getAllLeavesAdminService();

    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

    let scopedLeaves = leaves;
    if (!isSuperAdmin) {
      if (!req.user?.organizationId) {
        scopedLeaves = [];
      } else {
        const orgUsers = await User.find({ organizationId: req.user.organizationId }).select("_id");
        const orgUserIds = new Set(orgUsers.map((u) => String(u._id)));
        scopedLeaves = leaves.filter((l) => {
          const empId = l.employee?._id || l.employee;
          return orgUserIds.has(String(empId));
        });
      }
    } else if (req.query.organizationId) {
      const orgUsers = await User.find({ organizationId: req.query.organizationId }).select("_id");
      const orgUserIds = new Set(orgUsers.map((u) => String(u._id)));
      scopedLeaves = leaves.filter((l) => {
        const empId = l.employee?._id || l.employee;
        return orgUserIds.has(String(empId));
      });
    }

    return res.status(200).json({
      success: true,
      leaves: scopedLeaves,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Approve Leave — Super Admin only
export const approveLeave = async (req, res) => {
  try {
    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin" || userRole === "admin";
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only Super Admin can approve leave requests.",
      });
    }

    const leaveRecord = await Leave.findById(req.params.id);
    if (!leaveRecord) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    const requestingUserId = String(req.user?.id || req.user?._id);
    const leaveOwnerId = String(leaveRecord.employee);

    if (requestingUserId === leaveOwnerId) {
      return res.status(403).json({
        success: false,
        message: "You cannot approve your own leave request",
      });
    }

    const leave = await approveLeaveService(req.params.id);

    // Notify the applicant and Super Admin
    try {
      const applicant = await User.findById(leaveOwnerId).select("email name role");
      const leaveType = leaveRecord.leaveType || "Leave";
      const startDate = leaveRecord.startDate ? new Date(leaveRecord.startDate).toLocaleDateString("en-IN") : "";
      const endDate = leaveRecord.endDate ? new Date(leaveRecord.endDate).toLocaleDateString("en-IN") : "";
      const reason = leaveRecord.reason || "—";
      const applicantName = applicant?.name || "Employee";
      const applicantEmail = applicant?.email || "—";

      // Approver details
      const approver = await User.findById(requestingUserId).select("name email role");
      const approverName = approver?.name || req.user?.name || "Super Admin";
      const approverRole = approver?.role || req.user?.role || "SUPER_ADMIN";

      // 1. Create in-app notification for applicant
      await createNotification({
        recipient: leaveOwnerId,
        type: "leave_approved",
        message: `Your ${leaveType} leave request (${startDate} – ${endDate}) has been approved by ${approverName}.`,
        relatedLeave: leave._id,
      });

      // 2. Send email to applicant if email exists
      if (applicant?.email) {
        await sendLeaveEmail({
          to: applicant.email,
          subject: `Leave Approved — ${leaveType} Leave`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #16a34a; margin-top: 0;">Leave Approved</h2>
              <p>Hi <strong>${applicantName}</strong>,</p>
              <p>Your <strong>${leaveType} leave</strong> request has been <strong style="color:#16a34a">approved</strong> by ${approverName} (${approverRole}).</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 30%;">Start Date:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${startDate}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">End Date:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${endDate}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Status:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #16a34a; font-weight: bold;">Approved</td></tr>
              </table>
              <p>Please plan accordingly. Have a good leave!</p>
            </div>
          `,
        });
      }

      // 3. Send email to Super Admin Gmail
      const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
      await sendLeaveEmail({
        to: superAdminEmail,
        subject: `Leave Request Approved: ${applicantName} (${leaveType} Leave)`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #16a34a; margin-top: 0;">Leave Request Approved</h2>
            <p>The following leave request has been <strong style="color: #16a34a;">approved</strong>.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 35%;">Applicant:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${applicantName} (${applicantEmail})</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Applicant Role:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${applicant?.role || "Staff"}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Leave Type:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${leaveType} Leave</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Duration:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${startDate} – ${endDate}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Reason:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${reason}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Approved By:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${approverName} (${approverRole})</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Status:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #16a34a; font-weight: bold;">Approved</td></tr>
            </table>
            <p style="color: #64748b; font-size: 13px;">This notification was sent to Super Admin at ${superAdminEmail}.</p>
          </div>
        `,
      });
    } catch (notifErr) {
      console.error("Leave approve notification error:", notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Leave approved",
      leave,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Reject Leave — Super Admin only
export const rejectLeave = async (req, res) => {
  try {
    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin" || userRole === "admin";
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Only Super Admin can reject leave requests.",
      });
    }

    const leaveRecord = await Leave.findById(req.params.id);
    if (!leaveRecord) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    const requestingUserId = String(req.user?.id || req.user?._id);
    const leaveOwnerId = String(leaveRecord.employee);

    if (requestingUserId === leaveOwnerId) {
      return res.status(403).json({
        success: false,
        message: "You cannot reject your own leave request",
      });
    }

    const leave = await rejectLeaveService(req.params.id);

    // Notify the applicant and Super Admin
    try {
      const applicant = await User.findById(leaveOwnerId).select("email name role");
      const leaveType = leaveRecord.leaveType || "Leave";
      const startDate = leaveRecord.startDate ? new Date(leaveRecord.startDate).toLocaleDateString("en-IN") : "";
      const endDate = leaveRecord.endDate ? new Date(leaveRecord.endDate).toLocaleDateString("en-IN") : "";
      const reason = leaveRecord.reason || "—";
      const applicantName = applicant?.name || "Employee";
      const applicantEmail = applicant?.email || "—";

      // Rejector details
      const approver = await User.findById(requestingUserId).select("name email role");
      const approverName = approver?.name || req.user?.name || "Super Admin";
      const approverRole = approver?.role || req.user?.role || "SUPER_ADMIN";

      // 1. Create in-app notification for applicant
      await createNotification({
        recipient: leaveOwnerId,
        type: "leave_rejected",
        message: `Your ${leaveType} leave request (${startDate} – ${endDate}) has been rejected by ${approverName}.`,
        relatedLeave: leave._id,
      });

      // 2. Send email to applicant if email exists
      if (applicant?.email) {
        await sendLeaveEmail({
          to: applicant.email,
          subject: `Leave Rejected — ${leaveType} Leave`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #dc2626; margin-top: 0;">Leave Rejected</h2>
              <p>Hi <strong>${applicantName}</strong>,</p>
              <p>Your <strong>${leaveType} leave</strong> request has been <strong style="color:#dc2626">rejected</strong> by ${approverName} (${approverRole}).</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 30%;">Start Date:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${startDate}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">End Date:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${endDate}</td></tr>
                <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Status:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #dc2626; font-weight: bold;">Rejected</td></tr>
              </table>
              <p>Please contact management if you have questions.</p>
            </div>
          `,
        });
      }

      // 3. Send email to Super Admin Gmail
      const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
      await sendLeaveEmail({
        to: superAdminEmail,
        subject: `Leave Request Rejected: ${applicantName} (${leaveType} Leave)`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #dc2626; margin-top: 0;">Leave Request Rejected</h2>
            <p>The following leave request has been <strong style="color: #dc2626;">rejected</strong>.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold; width: 35%;">Applicant:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${applicantName} (${applicantEmail})</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Applicant Role:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${applicant?.role || "Staff"}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Leave Type:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${leaveType} Leave</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Duration:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${startDate} – ${endDate}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Reason:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${reason}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Rejected By:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${approverName} (${approverRole})</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; font-weight: bold;">Status:</td><td style="padding: 8px; border-bottom: 1px solid #f1f5f9; color: #dc2626; font-weight: bold;">Rejected</td></tr>
            </table>
            <p style="color: #64748b; font-size: 13px;">This notification was sent to Super Admin at ${superAdminEmail}.</p>
          </div>
        `,
      });
    } catch (notifErr) {
      console.error("Leave reject notification error:", notifErr.message);
    }

    return res.status(200).json({
      success: true,
      message: "Leave rejected",
      leave,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// Cancel Leave
export const cancelLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: "Leave request not found",
      });
    }

    // Ownership check: only the leave owner can cancel
    const requestingUserId = String(req.user?.id || req.user?._id);
    const leaveOwnerId = String(leave.employee);

    if (requestingUserId !== leaveOwnerId) {
      return res.status(403).json({
        success: false,
        message: "You can only cancel your own leave requests",
      });
    }

    if (leave.status !== "Pending" && leave.status !== "Approved") {
      return res.status(400).json({
        success: false,
        message: "Only Pending or Approved leaves can be cancelled",
      });
    }

    await cancelLeaveService(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Leave cancelled successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
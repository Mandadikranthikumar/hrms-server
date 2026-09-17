import Submission from "../models/Submission.js";
import TaskAssignment from "../models/TaskAssignment.js";
import Candidate from "../models/Candidate.js";
import Review from "../models/Review.js";
import User from "../models/UserModel.js";
import { calculateDeadlineStatus } from "../utils/calculateDeadlineStatus.js";
import { successResponse, errorResponse } from "../utils/responseFormatter.js";
import { createNotification, sendTaskSubmissionEmail } from "../services/notificationService.js";

// @desc    Get all submissions with filtering
// @route   GET /api/submissions
// @access  Private
export const getSubmissions = async (req, res, next) => {
  try {
    const { candidateId, assignmentId, status, page = 1, limit = 50 } = req.query;

    const query = {};

    const userRole = (req.user?.role || "").trim().toLowerCase();
    if (userRole === "employee") {
      const email = req.user?.email ? req.user.email.toLowerCase().trim() : "";
      const candidate = await Candidate.findOne({ email });
      if (candidate) {
        query.candidate = candidate._id;
      } else {
        return successResponse(res, 200, "Submissions retrieved successfully", {
          submissions: [],
          pagination: { total: 0, page: 1, limit: parseInt(limit, 10), pages: 1 },
        });
      }
    } else if (candidateId) {
      query.candidate = candidateId;
    }

    if (assignmentId) {
      query.taskAssignment = assignmentId;
    }

    if (status) {
      query.status = status;
    }

    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

    if (!isSuperAdmin && userRole !== "employee") {
      if (!req.user?.organizationId) {
        return successResponse(res, 200, "Submissions retrieved successfully", {
          submissions: [],
          pagination: { total: 0, page: 1, limit: parseInt(limit, 10), pages: 1 },
        });
      }
      query.organizationId = req.user.organizationId;
    } else if (isSuperAdmin && req.query.organizationId) {
      query.organizationId = req.query.organizationId;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const total = await Submission.countDocuments(query);

    const submissions = await Submission.find(query)
      .populate("candidate", "name email team department designation")
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }, { path: "assignedBy", select: "name email role" }],
      })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10));

    // Fetch reviews for each submission
    const submissionIds = submissions.map((s) => s._id);
    const reviews = await Review.find({ submission: { $in: submissionIds } })
      .populate("reviewer", "name email role")
      .sort({ reviewedAt: -1 });

    const submissionsWithReviews = submissions.map((sub) => {
      const subReviews = reviews.filter(
        (r) => r.submission.toString() === sub._id.toString()
      );
      const assignmentDeadline = sub.taskAssignment
        ? calculateDeadlineStatus(sub.taskAssignment)
        : null;

      return {
        ...sub.toObject(),
        reviews: subReviews,
        deadlineInfo: assignmentDeadline,
      };
    });

    return successResponse(res, 200, "Submissions retrieved successfully", {
      submissions: submissionsWithReviews,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get submission by ID with complete details and review history
// @route   GET /api/submissions/:id
// @access  Private
export const getSubmissionById = async (req, res, next) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate("candidate", "name email department team designation")
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }, { path: "assignedBy", select: "name email role" }],
      });

    if (!submission) {
      return errorResponse(res, 404, "Submission not found");
    }

    const reviews = await Review.find({ submission: submission._id })
      .populate("reviewer", "name email role")
      .sort({ reviewedAt: -1 });

    const allAssignmentSubmissions = await Submission.find({
      taskAssignment: submission.taskAssignment?._id,
    }).sort({ version: 1 });

    const deadlineInfo = submission.taskAssignment
      ? calculateDeadlineStatus(submission.taskAssignment)
      : null;

    return successResponse(res, 200, "Submission details retrieved", {
      submission: {
        ...submission.toObject(),
        reviews,
        deadlineInfo,
        allVersions: allAssignmentSubmissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new submission for a task assignment (Submit work)
// @route   POST /api/submissions
// @access  Private (Candidate, Admin, HR)
export const createSubmission = async (req, res, next) => {
  try {
    const { taskAssignmentId, submissionText, attachmentUrl } = req.body;

    if (!taskAssignmentId || !submissionText) {
      return errorResponse(res, 400, "Task assignment ID and submission text/notes are required");
    }

    const assignment = await TaskAssignment.findById(taskAssignmentId).populate("task");
    if (!assignment) {
      return errorResponse(res, 404, "Task assignment not found");
    }

    // Check if task is already completed
    if (assignment.status === "COMPLETED") {
      return errorResponse(res, 400, "Task is already COMPLETED and cannot be resubmitted");
    }

    // Determine submission version: count existing submissions for this assignment + 1
    const previousSubmissionsCount = await Submission.countDocuments({
      taskAssignment: assignment._id,
    });
    const newVersion = previousSubmissionsCount + 1;

    // Create new submission record
    const submission = await Submission.create({
      taskAssignment: assignment._id,
      candidate: assignment.candidate,
      submissionText,
      attachmentUrl: attachmentUrl || "",
      version: newVersion,
      status: "SUBMITTED",
      submittedAt: new Date(),
      organizationId: req.user?.organizationId || null,
    });

    // Update assignment status to SUBMITTED and progress to 100%
    assignment.status = "SUBMITTED";
    assignment.progressPercentage = 100;
    await assignment.save();

    const populatedSubmission = await Submission.findById(submission._id)
      .populate("candidate", "name email team department")
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }, { path: "assignedBy", select: "name email role" }],
      });

    // Asynchronously notify HR of this organization via in-app notification and email
    setImmediate(async () => {
      try {
        const orgId = assignment.organizationId || req.user?.organizationId;
        const hrQuery = {
          role: { $in: ["Admin", "HR", "HR Manager", "hr_manager", "hr", "Human Resources", "SUPER_ADMIN", "super_admin"] },
        };
        if (orgId) {
          hrQuery.$or = [{ organizationId: orgId }, { organizationId: null }];
        }

        let hrUsers = await User.find(hrQuery).select("_id email name role");

        // Also ensure the user who assigned the task is explicitly included
        const assignedById = populatedSubmission.taskAssignment?.assignedBy?._id || assignment.assignedBy;
        if (assignedById) {
          const alreadyIncluded = hrUsers.some((u) => u._id.toString() === assignedById.toString());
          if (!alreadyIncluded) {
            const assignerUser = await User.findById(assignedById).select("_id email name role");
            if (assignerUser) {
              hrUsers.push(assignerUser);
            }
          }
        }

        const candName = populatedSubmission.candidate?.name || "Employee";
        const candEmail = populatedSubmission.candidate?.email || "";
        const taskTitle = populatedSubmission.taskAssignment?.task?.title || "Assigned Task";
        const taskId = populatedSubmission.taskAssignment?.task?._id || assignment.task;

        for (const hr of hrUsers) {
          const deliverableSnippet = attachmentUrl ? ` Link: ${attachmentUrl}` : "";
          await createNotification({
            recipient: hr._id,
            type: "task_submitted",
            message: `${candName} submitted deliverable for "${taskTitle}" (v${newVersion}).${deliverableSnippet}`,
            attachmentUrl: attachmentUrl || "",
            relatedTask: taskId,
            relatedAssignment: assignment._id,
            link: "/hr/reviews",
          });

          await sendTaskSubmissionEmail({
            to: hr.email,
            taskTitle,
            employeeName: candName,
            employeeEmail: candEmail,
            submissionText,
            attachmentUrl: attachmentUrl || "",
            version: newVersion,
          });
        }
      } catch (notifErr) {
        console.error("Submission HR notification/email error:", notifErr.message);
      }
    });

    return successResponse(res, 201, "Work submitted successfully for review", {
      submission: populatedSubmission,
      assignmentStatus: assignment.status,
      version: newVersion,
    });
  } catch (error) {
    next(error);
  }
};
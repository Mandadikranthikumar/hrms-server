import Review from "../models/Review.js";
import Submission from "../models/Submission.js";
import TaskAssignment from "../models/TaskAssignment.js";
import User from "../models/UserModel.js";
import Candidate from "../models/Candidate.js";
import { calculateDeadlineStatus } from "../utils/calculateDeadlineStatus.js";
import { successResponse, errorResponse } from "../utils/responseFormatter.js";
import { createNotification, sendTaskReviewEmail } from "../services/notificationService.js";

// @desc    Get review queue (submissions awaiting review)
// @route   GET /api/reviews/pending
// @access  Private (Admin, HR)
export const getReviewQueue = async (req, res, next) => {
  try {
    const { team, priority, search } = req.query;

    const subFilter = { status: "SUBMITTED" };
    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

    if (!isSuperAdmin) {
      if (!req.user?.organizationId) {
        return successResponse(res, 200, "Review queue retrieved", {
          queue: [],
          count: 0,
        });
      }
      subFilter.organizationId = req.user.organizationId;
    } else if (req.query.organizationId) {
      subFilter.organizationId = req.query.organizationId;
    }

    const submissions = await Submission.find(subFilter)
      .populate("candidate")
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }, { path: "assignedBy", select: "name email role" }],
      })
      .sort({ submittedAt: -1 });

    let queue = submissions.map((sub) => {
      const deadlineInfo = sub.taskAssignment
        ? calculateDeadlineStatus(sub.taskAssignment)
        : null;
      return {
        ...sub.toObject(),
        deadlineInfo,
      };
    });

    if (team) {
      queue = queue.filter(
        (item) => item.candidate && item.candidate.team?.toLowerCase() === team.toLowerCase()
      );
    }

    if (priority) {
      queue = queue.filter(
        (item) =>
          item.taskAssignment?.task &&
          item.taskAssignment.task.priority?.toUpperCase() === priority.toUpperCase()
      );
    }

    if (search) {
      const s = search.toLowerCase();
      queue = queue.filter((item) => {
        const title = item.taskAssignment?.task?.title?.toLowerCase() || "";
        const name = item.candidate?.name?.toLowerCase() || "";
        const email = item.candidate?.email?.toLowerCase() || "";
        return title.includes(s) || name.includes(s) || email.includes(s);
      });
    }

    return successResponse(res, 200, "Review queue retrieved", {
      queue,
      count: queue.length,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single review by ID
// @route   GET /api/reviews/:id
// @access  Private
export const getReviewById = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate("reviewer", "name email role")
      .populate({
        path: "submission",
        populate: [{ path: "candidate" }],
      })
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }],
      });

    if (!review) {
      return errorResponse(res, 404, "Review not found");
    }

    return successResponse(res, 200, "Review retrieved successfully", { review });
  } catch (error) {
    next(error);
  }
};

// @desc    Approve a submission -> Task becomes COMPLETED
// @route   POST /api/reviews/:submissionId/approve
// @access  Private (Admin, HR)
export const approveSubmission = async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { comments } = req.body;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return errorResponse(res, 404, "Submission not found");
    }

    const assignment = await TaskAssignment.findById(submission.taskAssignment);
    if (!assignment) {
      return errorResponse(res, 404, "Task assignment not found");
    }

    const reviewerId = req.user?.id || req.user?._id;

    // Create Review record
    const review = await Review.create({
      submission: submission._id,
      taskAssignment: assignment._id,
      reviewer: reviewerId,
      comments: comments || "Submission approved. Task completed successfully.",
      decision: "APPROVED",
      reviewedAt: new Date(),
      organizationId: req.user?.organizationId || null,
    });

    // Update Submission status
    submission.status = "APPROVED";
    await submission.save();

    // Update TaskAssignment to COMPLETED
    assignment.status = "COMPLETED";
    assignment.completedAt = new Date();
    assignment.progressPercentage = 100;
    await assignment.save();

    const populatedReview = await Review.findById(review._id)
      .populate("reviewer", "name email role")
      .populate("submission")
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }, { path: "candidate" }],
      });

    // Notify employee of approval via in-app notification and email
    setImmediate(async () => {
      try {
        const cand = populatedReview.taskAssignment?.candidate;
        const candEmail = cand?.email;
        const taskTitle = populatedReview.taskAssignment?.task?.title || "task";
        const reviewerName = populatedReview.reviewer?.name || "HR Manager";

        if (candEmail) {
          const candUser = await User.findOne({ email: candEmail.toLowerCase().trim() }).select("_id");
          if (candUser) {
            await createNotification({
              recipient: candUser._id,
              type: "task_approved",
              message: `Congratulations! Your deliverable for "${taskTitle}" has been approved!`,
              relatedTask: populatedReview.taskAssignment?.task?._id,
              relatedAssignment: populatedReview.taskAssignment?._id,
              link: "/employee/tasks",
            });
          }

          await sendTaskReviewEmail({
            to: candEmail,
            taskTitle,
            employeeName: cand?.name || "Employee",
            reviewerName,
            decision: "APPROVED",
            comments: review.comments,
          });
        }
      } catch (nErr) {
        console.error("Task approved notification error:", nErr.message);
      }
    });

    return successResponse(res, 200, "Submission approved and task marked as COMPLETED", {
      review: populatedReview,
      assignmentStatus: "COMPLETED",
      submissionStatus: "APPROVED",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Request rework on a submission -> Task becomes REWORK_REQUIRED
// @route   POST /api/reviews/:submissionId/rework
// @access  Private (Admin, HR)
export const reworkSubmission = async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const { comments } = req.body;

    if (!comments || !comments.trim()) {
      return errorResponse(res, 400, "Review feedback comments are required when requesting rework");
    }

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return errorResponse(res, 404, "Submission not found");
    }

    const assignment = await TaskAssignment.findById(submission.taskAssignment);
    if (!assignment) {
      return errorResponse(res, 404, "Task assignment not found");
    }

    const reviewerId = req.user?.id || req.user?._id;

    // Create Review record with rework decision
    const review = await Review.create({
      submission: submission._id,
      taskAssignment: assignment._id,
      reviewer: reviewerId,
      comments: comments.trim(),
      decision: "REWORK_REQUIRED",
      reviewedAt: new Date(),
      organizationId: req.user?.organizationId || null,
    });

    // Update Submission status
    submission.status = "REWORK_REQUIRED";
    await submission.save();

    // Update TaskAssignment to REWORK_REQUIRED
    assignment.status = "REWORK_REQUIRED";
    await assignment.save();

    const populatedReview = await Review.findById(review._id)
      .populate("reviewer", "name email role")
      .populate("submission")
      .populate({
        path: "taskAssignment",
        populate: [{ path: "task" }, { path: "candidate" }],
      });

    // Notify employee of rework request via in-app notification and email
    setImmediate(async () => {
      try {
        const cand = populatedReview.taskAssignment?.candidate;
        const candEmail = cand?.email;
        const taskTitle = populatedReview.taskAssignment?.task?.title || "task";
        const reviewerName = populatedReview.reviewer?.name || "HR Manager";

        if (candEmail) {
          const candUser = await User.findOne({ email: candEmail.toLowerCase().trim() }).select("_id");
          if (candUser) {
            await createNotification({
              recipient: candUser._id,
              type: "task_rework",
              message: `Rework requested for "${taskTitle}": "${comments.trim()}"`,
              relatedTask: populatedReview.taskAssignment?.task?._id,
              relatedAssignment: populatedReview.taskAssignment?._id,
              link: "/employee/tasks",
            });
          }

          await sendTaskReviewEmail({
            to: candEmail,
            taskTitle,
            employeeName: cand?.name || "Employee",
            reviewerName,
            decision: "REWORK_REQUIRED",
            comments: comments.trim(),
          });
        }
      } catch (nErr) {
        console.error("Task rework notification error:", nErr.message);
      }
    });

    return successResponse(res, 200, "Rework requested successfully", {
      review: populatedReview,
      assignmentStatus: "REWORK_REQUIRED",
      submissionStatus: "REWORK_REQUIRED",
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reviews for an assignment
// @route   GET /api/reviews/assignment/:assignmentId
// @access  Private
export const getAssignmentReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ taskAssignment: req.params.assignmentId })
      .populate("reviewer", "name email role")
      .populate("submission")
      .sort({ reviewedAt: -1 });

    return successResponse(res, 200, "Assignment review history retrieved", { reviews });
  } catch (error) {
    next(error);
  }
};
import TaskAssignment from "../models/TaskAssignment.js";
import Task from "../models/Task.js";
import Candidate from "../models/Candidate.js";
import Submission from "../models/Submission.js";
import Review from "../models/Review.js";
import User from "../models/UserModel.js";
import { calculateDeadlineStatus } from "../utils/calculateDeadlineStatus.js";
import { successResponse, errorResponse } from "../utils/responseFormatter.js";
import { createNotification, sendTaskAssignmentEmail } from "../services/notificationService.js";

// @desc    Get all task assignments with rich filters and dynamic overdue calculation
// @route   GET /api/assignments
// @access  Private
export const getAssignments = async (req, res, next) => {
    try {
        const {
            candidateId,
            taskId,
            status,
            priority,
            team,
            isOverdue,
            search,
            page = 1,
            limit = 100,
        } = req.query;

        const query = {};

        const userRole = (req.user?.role || "").trim().toLowerCase();
        if (userRole === "employee") {
            const email = req.user?.email ? req.user.email.toLowerCase().trim() : "";
            const candidate = await Candidate.findOne({ email });
            if (candidate) {
                query.candidate = candidate._id;
            } else {
                return successResponse(res, 200, "Assignments fetched successfully", {
                    assignments: [],
                    pagination: { total: 0, page: 1, limit: parseInt(limit, 10), pages: 1 },
                });
            }
        } else if (candidateId) {
            query.candidate = candidateId;
        }

        if (taskId) {
            query.task = taskId;
        }

        if (status) {
            query.status = status;
        }

        const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

        if (!isSuperAdmin && userRole !== "employee") {
            if (!req.user?.organizationId) {
                return successResponse(res, 200, "Assignments fetched successfully", {
                    assignments: [],
                    pagination: { total: 0, page: 1, limit: parseInt(limit, 10), pages: 1 },
                });
            }
            query.organizationId = req.user.organizationId;
        } else if (isSuperAdmin && req.query.organizationId) {
            query.organizationId = req.query.organizationId;
        }

        const assignments = await TaskAssignment.find(query)
            .populate("task")
            .populate("candidate")
            .populate("assignedBy", "name email role")
            .sort({ createdAt: -1 });

        // Joined in-memory filtering for populated fields
        let filtered = assignments.map((a) => {
            const deadlineInfo = calculateDeadlineStatus(a);
            return {
                ...a.toObject(),
                ...deadlineInfo,
            };
        });

        if (priority) {
            filtered = filtered.filter(
                (a) => a.task && a.task.priority?.toUpperCase() === priority.toUpperCase()
            );
        }

        if (team) {
            filtered = filtered.filter(
                (a) => a.candidate && a.candidate.team?.toLowerCase() === team.toLowerCase()
            );
        }

        if (isOverdue !== undefined && isOverdue !== "") {
            const shouldBeOverdue = isOverdue === "true" || isOverdue === true;
            filtered = filtered.filter((a) => a.isOverdue === shouldBeOverdue);
        }

        if (search) {
            const s = search.toLowerCase();
            filtered = filtered.filter((a) => {
                const taskTitle = a.task?.title?.toLowerCase() || "";
                const taskDesc = a.task?.description?.toLowerCase() || "";
                const candName = a.candidate?.name?.toLowerCase() || "";
                const candEmail = a.candidate?.email?.toLowerCase() || "";
                return (
                    taskTitle.includes(s) ||
                    taskDesc.includes(s) ||
                    candName.includes(s) ||
                    candEmail.includes(s)
                );
            });
        }

        const total = filtered.length;
        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const paginated = filtered.slice(skip, skip + parseInt(limit, 10));

        return successResponse(res, 200, "Assignments fetched successfully", {
            assignments: paginated,
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

// @desc    Get single assignment details with submissions & reviews
// @route   GET /api/assignments/:id
// @access  Private
export const getAssignmentById = async (req, res, next) => {
    try {
        const assignment = await TaskAssignment.findById(req.params.id)
            .populate("task")
            .populate("candidate")
            .populate("assignedBy", "name email role");

        if (!assignment) {
            return errorResponse(res, 404, "Task assignment not found");
        }

        const submissions = await Submission.find({ taskAssignment: assignment._id })
            .populate("candidate", "name email")
            .sort({ version: 1 });

        const reviews = await Review.find({ taskAssignment: assignment._id })
            .populate("reviewer", "name email role")
            .sort({ reviewedAt: 1 });

        const submissionsWithReviews = submissions.map((sub) => {
            const subReviews = reviews.filter(
                (r) => r.submission.toString() === sub._id.toString()
            );
            return {
                ...sub.toObject(),
                reviews: subReviews,
            };
        });

        const deadlineInfo = calculateDeadlineStatus(assignment);

        return successResponse(res, 200, "Task assignment details retrieved", {
            assignment: {
                ...assignment.toObject(),
                ...deadlineInfo,
                submissions: submissionsWithReviews,
                reviews,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new task assignment
// @route   POST /api/assignments
// @access  Private (Admin, HR)
export const createAssignment = async (req, res, next) => {
    try {
        const { taskId, candidateId, deadline, notes, progressPercentage } = req.body;

        if (!taskId || !candidateId || !deadline) {
            return errorResponse(res, 400, "Task, Candidate, and Deadline are required");
        }

        const task = await Task.findById(taskId);
        if (!task) {
            return errorResponse(res, 404, "Task not found");
        }

        const candidate = await Candidate.findById(candidateId);
        if (!candidate) {
            return errorResponse(res, 404, "Candidate not found");
        }

        const userRole = (req.user?.role || "").trim().toLowerCase();
        const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

        if (!isSuperAdmin) {
            const orgId = req.user?.organizationId?.toString();
            const candOrgId = candidate.organizationId?.toString();
            if (!orgId || (candOrgId && orgId !== candOrgId)) {
                return errorResponse(res, 403, "Access denied: You can only allocate tasks to employees of your organization");
            }
        }

        const userId = req.user?.id || req.user?._id;

        const assignment = await TaskAssignment.create({
            task: taskId,
            candidate: candidateId,
            assignedBy: userId,
            deadline: new Date(deadline),
            notes: notes || "",
            status: "PENDING",
            progressPercentage: progressPercentage || 0,
            assignmentVersion: 1,
            organizationId: req.user?.organizationId || null,
        });

        const populated = await TaskAssignment.findById(assignment._id)
            .populate("task")
            .populate("candidate")
            .populate("assignedBy", "name email role");

        const deadlineInfo = calculateDeadlineStatus(populated);

        // Asynchronously notify candidate via in-app notification and email
        setImmediate(async () => {
            try {
                if (candidate.email) {
                    const candUser = await User.findOne({ email: candidate.email.toLowerCase().trim() });
                    if (candUser) {
                        await createNotification({
                            recipient: candUser._id,
                            type: "task_assigned",
                            message: `You have been assigned a new task: "${task.title}". Deadline: ${new Date(deadline).toLocaleDateString()}.`,
                            relatedTask: task._id,
                            relatedAssignment: assignment._id,
                            link: "/employee/tasks",
                        });
                    }
                    await sendTaskAssignmentEmail({
                        to: candidate.email,
                        taskTitle: task.title,
                        employeeName: candidate.name,
                        assignedBy: req.user?.name || "HR Manager",
                        deadline,
                        priority: task.priority,
                        description: task.description,
                        notes: notes || "",
                    });
                }
            } catch (err) {
                console.error("createAssignment notification/email error:", err.message);
            }
        });

        return successResponse(res, 201, "Task assigned successfully", {
            assignment: {
                ...populated.toObject(),
                ...deadlineInfo,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update assignment details (deadline, notes, status, progress)
// @route   PUT /api/assignments/:id
// @access  Private (Admin, HR)
export const updateAssignment = async (req, res, next) => {
    try {
        const { deadline, notes, status, progressPercentage } = req.body;

        const assignment = await TaskAssignment.findById(req.params.id);
        if (!assignment) {
            return errorResponse(res, 404, "Assignment not found");
        }

        if (deadline) assignment.deadline = new Date(deadline);
        if (notes !== undefined) assignment.notes = notes;

        if (status && ["PENDING", "IN_PROGRESS", "SUBMITTED", "COMPLETED", "REWORK_REQUIRED"].includes(status)) {
            assignment.status = status;
            if (status === "COMPLETED" && !assignment.completedAt) {
                assignment.completedAt = new Date();
            }
        }

        if (progressPercentage !== undefined) {
            assignment.progressPercentage = Math.min(100, Math.max(0, Number(progressPercentage)));
        }

        await assignment.save();

        const populated = await TaskAssignment.findById(assignment._id)
            .populate("task")
            .populate("candidate")
            .populate("assignedBy", "name email role");

        const deadlineInfo = calculateDeadlineStatus(populated);

        return successResponse(res, 200, "Assignment updated successfully", {
            assignment: {
                ...populated.toObject(),
                ...deadlineInfo,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Reassign assignment to another candidate
// @route   PUT /api/assignments/:id/reassign
// @access  Private (Admin, HR)
export const reassignAssignment = async (req, res, next) => {
    try {
        const { newCandidateId, deadline, notes } = req.body;

        if (!newCandidateId) {
            return errorResponse(res, 400, "New candidate ID is required for reassignment");
        }

        const candidate = await Candidate.findById(newCandidateId);
        if (!candidate) {
            return errorResponse(res, 404, "New candidate not found");
        }

        const assignment = await TaskAssignment.findById(req.params.id);
        if (!assignment) {
            return errorResponse(res, 404, "Assignment not found");
        }

        assignment.candidate = newCandidateId;
        if (deadline) assignment.deadline = new Date(deadline);
        if (notes !== undefined) assignment.notes = notes;
        assignment.assignmentVersion += 1;
        assignment.status = "PENDING";
        assignment.progressPercentage = 0;
        assignment.completedAt = null;

        await assignment.save();

        const populated = await TaskAssignment.findById(assignment._id)
            .populate("task")
            .populate("candidate")
            .populate("assignedBy", "name email role");

        const deadlineInfo = calculateDeadlineStatus(populated);

        // Asynchronously notify newly assigned candidate via in-app notification and email
        setImmediate(async () => {
            try {
                if (candidate.email) {
                    const candUser = await User.findOne({ email: candidate.email.toLowerCase().trim() });
                    const taskObj = populated.task;
                    if (candUser) {
                        await createNotification({
                            recipient: candUser._id,
                            type: "task_assigned",
                            message: `Task "${taskObj?.title || "Assigned Task"}" has been reassigned to you. Deadline: ${new Date(assignment.deadline).toLocaleDateString()}.`,
                            relatedTask: taskObj?._id,
                            relatedAssignment: assignment._id,
                            link: "/employee/tasks",
                        });
                    }
                    await sendTaskAssignmentEmail({
                        to: candidate.email,
                        taskTitle: taskObj?.title || "Assigned Task",
                        employeeName: candidate.name,
                        assignedBy: req.user?.name || "HR Manager",
                        deadline: assignment.deadline,
                        priority: taskObj?.priority || "MEDIUM",
                        description: taskObj?.description || "",
                        notes: assignment.notes || "",
                    });
                }
            } catch (err) {
                console.error("reassignAssignment notification/email error:", err.message);
            }
        });

        return successResponse(res, 200, "Task reassigned successfully", {
            assignment: {
                ...populated.toObject(),
                ...deadlineInfo,
            },
        });
    } catch (error) {
        next(error);
    }
};
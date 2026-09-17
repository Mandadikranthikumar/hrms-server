import Task from "../models/Task.js";
import TaskAssignment from "../models/TaskAssignment.js";
import User from "../models/UserModel.js";
import { calculateDeadlineStatus } from "../utils/calculateDeadlineStatus.js";
import { successResponse, errorResponse } from "../utils/responseFormatter.js";
import { createNotification, sendTaskAssignmentEmail } from "../services/notificationService.js";

// @desc    Get all tasks with assignment statistics
// @route   GET /api/tasks
// @access  Private
export const getTasks = async (req, res, next) => {
    try {
        const { search, priority, page = 1, limit = 50 } = req.query;

        const query = {};

        const userRole = (req.user?.role || "").trim().toLowerCase();
        const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

        if (!isSuperAdmin) {
            if (!req.user?.organizationId) {
                return successResponse(res, 200, "Tasks retrieved successfully", {
                    tasks: [],
                    pagination: { total: 0, page: 1, limit: parseInt(limit, 10), pages: 0 },
                });
            }
            query.organizationId = req.user.organizationId;
        } else if (req.query.organizationId) {
            query.organizationId = req.query.organizationId;
        }

        if (priority) query.priority = priority.toUpperCase();
        if (search) {
            const regex = new RegExp(search, "i");
            const searchConditions = [{ title: regex }, { description: regex }];
            if (query.$or) {
                query.$and = [{ $or: query.$or }, { $or: searchConditions }];
                delete query.$or;
            } else {
                query.$or = searchConditions;
            }
        }

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const total = await Task.countDocuments(query);
        const tasks = await Task.find(query)
            .populate("createdBy", "name email role")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit, 10));

        // Get current assignment counts for each task
        const taskIds = tasks.map((t) => t._id);
        const assignments = await TaskAssignment.find({ task: { $in: taskIds } }).populate(
            "candidate",
            "name email team department designation"
        );

        const tasksWithAssignments = tasks.map((task) => {
            const taskAssigns = assignments.filter(
                (a) => a.task.toString() === task._id.toString()
            );
            return {
                ...task.toObject(),
                assignments: taskAssigns,
                totalAssigned: taskAssigns.length,
            };
        });

        return successResponse(res, 200, "Tasks retrieved successfully", {
            tasks: tasksWithAssignments,
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

// @desc    Get single task with full assignment history
// @route   GET /api/tasks/:id
// @access  Private
export const getTaskById = async (req, res, next) => {
    try {
        const task = await Task.findById(req.params.id).populate("createdBy", "name email role");
        if (!task) {
            return errorResponse(res, 404, "Task not found");
        }

        const assignments = await TaskAssignment.find({ task: task._id })
            .populate("candidate", "name email department designation team status")
            .populate("assignedBy", "name email role")
            .sort({ createdAt: -1 });

        const assignmentsWithDeadline = assignments.map((a) => ({
            ...a.toObject(),
            ...calculateDeadlineStatus(a),
        }));

        return successResponse(res, 200, "Task details retrieved", {
            task,
            assignments: assignmentsWithDeadline,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create a new task with candidate assignment
// @route   POST /api/tasks
// @access  Private (Admin, HR)
export const createTask = async (req, res, next) => {
    try {
        const { title, description, priority, candidateId, candidateIds, deadline, notes } = req.body;

        if (!title || !description) {
            return errorResponse(res, 400, "Title and description are required");
        }

        const userId = req.user?.id || req.user?._id;

        const task = await Task.create({
            title,
            description,
            priority: priority ? priority.toUpperCase() : "MEDIUM",
            createdBy: userId,
            organizationId: req.user?.organizationId || null,
        });

        // Multi-candidate / bulk assignment
        if (Array.isArray(candidateIds) && candidateIds.length > 0 && deadline) {
            const uniqueCandidateIds = [...new Set(candidateIds.map((id) => id.toString()))];
            const createdAssignments = await Promise.all(
                uniqueCandidateIds.map((id) =>
                    TaskAssignment.create({
                        task: task._id,
                        candidate: id,
                        assignedBy: userId,
                        deadline: new Date(deadline),
                        notes: notes || "",
                        status: "PENDING",
                        progressPercentage: 0,
                        organizationId: req.user?.organizationId || null,
                    })
                )
            );

            const populatedAssignments = await TaskAssignment.find({
                _id: { $in: createdAssignments.map((a) => a._id) },
            })
                .populate("candidate", "name email team department designation")
                .populate("task");

            const assignments = populatedAssignments.map((populated) => ({
                ...populated.toObject(),
                ...calculateDeadlineStatus(populated),
            }));

            // Asynchronously notify all assigned candidates via in-app notification and email
            setImmediate(async () => {
                try {
                    const assignerName = req.user?.name || "HR Manager";
                    for (const candAssigned of populatedAssignments) {
                        const cand = candAssigned.candidate;
                        if (!cand || !cand.email) continue;
                        const candUser = await User.findOne({ email: cand.email.toLowerCase().trim() });
                        if (candUser) {
                            await createNotification({
                                recipient: candUser._id,
                                type: "task_assigned",
                                message: `You have been assigned a new task: "${task.title}". Deadline: ${new Date(deadline).toLocaleDateString()}.`,
                                relatedTask: task._id,
                                relatedAssignment: candAssigned._id,
                                link: "/employee/tasks",
                            });
                        }
                        await sendTaskAssignmentEmail({
                            to: cand.email,
                            taskTitle: task.title,
                            employeeName: cand.name,
                            assignedBy: assignerName,
                            deadline,
                            priority: task.priority,
                            description: task.description,
                            notes: notes || "",
                        });
                    }
                } catch (err) {
                    console.error("Bulk task allocation notification/email error:", err.message);
                }
            });

            return successResponse(res, 201, "Task created and allocated successfully", {
                task,
                assignments,
                totalAssigned: assignments.length,
            });
        }

        // Single-candidate assignment
        let assignment = null;
        if (candidateId && deadline) {
            const created = await TaskAssignment.create({
                task: task._id,
                candidate: candidateId,
                assignedBy: userId,
                deadline: new Date(deadline),
                notes: notes || "",
                status: "PENDING",
                progressPercentage: 0,
                organizationId: req.user?.organizationId || null,
            });

            const populated = await TaskAssignment.findById(created._id)
                .populate("candidate", "name email team department designation")
                .populate("task");

            assignment = {
                ...populated.toObject(),
                ...calculateDeadlineStatus(populated),
            };

            // Asynchronously notify candidate via in-app notification and email
            setImmediate(async () => {
                try {
                    const cand = populated?.candidate;
                    if (cand && cand.email) {
                        const candUser = await User.findOne({ email: cand.email.toLowerCase().trim() });
                        if (candUser) {
                            await createNotification({
                                recipient: candUser._id,
                                type: "task_assigned",
                                message: `You have been assigned a new task: "${task.title}". Deadline: ${new Date(deadline).toLocaleDateString()}.`,
                                relatedTask: task._id,
                                relatedAssignment: created._id,
                                link: "/employee/tasks",
                            });
                        }
                        await sendTaskAssignmentEmail({
                            to: cand.email,
                            taskTitle: task.title,
                            employeeName: cand.name,
                            assignedBy: req.user?.name || "HR Manager",
                            deadline,
                            priority: task.priority,
                            description: task.description,
                            notes: notes || "",
                        });
                    }
                } catch (err) {
                    console.error("Single task allocation notification/email error:", err.message);
                }
            });
        }

        return successResponse(res, 201, "Task created successfully", {
            task,
            assignment,
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update task details
// @route   PUT /api/tasks/:id
// @access  Private (Admin, HR)
export const updateTask = async (req, res, next) => {
    try {
        const { title, description, priority } = req.body;

        const task = await Task.findById(req.params.id);
        if (!task) {
            return errorResponse(res, 404, "Task not found");
        }

        task.title = title || task.title;
        task.description = description || task.description;
        if (priority) task.priority = priority.toUpperCase();

        await task.save();

        return successResponse(res, 200, "Task updated successfully", { task });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin, HR)
export const deleteTask = async (req, res, next) => {
    try {
        const task = await Task.findById(req.params.id);
        if (!task) {
            return errorResponse(res, 404, "Task not found");
        }

        await TaskAssignment.deleteMany({ task: task._id });
        await Task.findByIdAndDelete(req.params.id);

        return successResponse(res, 200, "Task and its assignments deleted successfully");
    } catch (error) {
        next(error);
    }
};
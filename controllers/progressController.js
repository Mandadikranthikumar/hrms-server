import TaskAssignment from "../models/TaskAssignment.js";
import Candidate from "../models/Candidate.js";
import { calculateDeadlineStatus } from "../utils/calculateDeadlineStatus.js";
import { successResponse, errorResponse } from "../utils/responseFormatter.js";

// @desc    Get overall progress monitoring summary
// @route   GET /api/progress
// @access  Private
export const getProgressOverview = async (req, res, next) => {
  try {
    const query = {};
    if (req.user?.organizationId) {
      query.$or = [{ organizationId: req.user.organizationId }, { organizationId: null }];
    }

    const userRole = (req.user?.role || "").trim().toLowerCase();
    if (userRole === "employee") {
      const email = req.user?.email ? req.user.email.toLowerCase().trim() : "";
      const candidate = await Candidate.findOne({ email });
      if (candidate) {
        query.candidate = candidate._id;
      } else {
        return successResponse(res, 200, "Progress overview retrieved", {
          summary: {
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            pendingTasks: 0,
            submittedTasks: 0,
            reworkRequiredTasks: 0,
            overdueTasks: 0,
            overallProgressPercentage: 0,
            completionRate: 0,
            onTimeRate: 0,
          },
          deadlines: {
            upcoming: 0,
            dueToday: 0,
            overdue: 0,
            completedOnTime: 0,
            completedLate: 0,
          },
        });
      }
    }

    const assignments = await TaskAssignment.find(query).populate("task").populate("candidate");

    const totalTasks = assignments.length;
    let pending = 0;
    let inProgress = 0;
    let submitted = 0;
    let completed = 0;
    let reworkRequired = 0;
    let overdue = 0;

    let upcoming = 0;
    let dueToday = 0;
    let completedOnTime = 0;
    let completedLate = 0;

    let totalProgressSum = 0;

    assignments.forEach((a) => {
      totalProgressSum += a.progressPercentage || 0;

      const { isOverdue, deadlineCategory } = calculateDeadlineStatus(a);

      if (isOverdue) overdue++;

      switch (a.status) {
        case "PENDING":
          pending++;
          break;
        case "IN_PROGRESS":
          inProgress++;
          break;
        case "SUBMITTED":
          submitted++;
          break;
        case "COMPLETED":
          completed++;
          break;
        case "REWORK_REQUIRED":
          reworkRequired++;
          break;
        default:
          break;
      }

      switch (deadlineCategory) {
        case "UPCOMING":
          upcoming++;
          break;
        case "DUE_TODAY":
          dueToday++;
          break;
        case "COMPLETED_ON_TIME":
          completedOnTime++;
          break;
        case "COMPLETED_LATE":
          completedLate++;
          break;
        default:
          break;
      }
    });

    const averageProgress = totalTasks > 0 ? Math.round(totalProgressSum / totalTasks) : 0;
    const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

    return successResponse(res, 200, "Progress overview retrieved", {
      summary: {
        totalTasks,
        pending,
        inProgress,
        submitted,
        completed,
        reworkRequired,
        overdue,
        averageProgress,
        overallProgressPercentage: averageProgress,
        completionRate,
      },
      deadlines: {
        upcoming,
        dueToday,
        overdue,
        completedOnTime,
        completedLate,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get progress details for all candidates
// @route   GET /api/progress/candidates
// @access  Private
export const getCandidateProgress = async (req, res, next) => {
  try {
    const { team, search } = req.query;

    const query = { status: "ACTIVE" };
    if (req.user?.organizationId) {
      query.$or = [{ organizationId: req.user.organizationId }, { organizationId: null }];
    }

    const userRole = (req.user?.role || "").trim().toLowerCase();
    if (userRole === "employee") {
      const email = req.user?.email ? req.user.email.toLowerCase().trim() : "";
      query.email = email;
    } else {
      if (team) query.team = team;
      if (search) {
        const regex = new RegExp(search, "i");
        query.$or = [{ name: regex }, { email: regex }, { department: regex }, { designation: regex }];
      }
    }

    const candidates = await Candidate.find(query).sort({ name: 1 });
    const assignments = await TaskAssignment.find().populate("task");

    const candidatesProgress = candidates.map((cand) => {
      const candAssigns = assignments.filter(
        (a) => a.candidate && a.candidate.toString() === cand._id.toString()
      );

      const totalTasks = candAssigns.length;
      let completed = 0;
      let inProgress = 0;
      let pending = 0;
      let submitted = 0;
      let rework = 0;
      let overdue = 0;
      let totalProgress = 0;

      candAssigns.forEach((a) => {
        totalProgress += a.progressPercentage || 0;
        const { isOverdue } = calculateDeadlineStatus(a);
        if (isOverdue) overdue++;

        if (a.status === "COMPLETED") completed++;
        else if (a.status === "IN_PROGRESS") inProgress++;
        else if (a.status === "PENDING") pending++;
        else if (a.status === "SUBMITTED") submitted++;
        else if (a.status === "REWORK_REQUIRED") rework++;
      });

      const avgProgress = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;
      const completionRate = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

      return {
        _id: cand._id,
        name: cand.name,
        email: cand.email,
        team: cand.team,
        department: cand.department,
        designation: cand.designation,
        totalTasks,
        completed,
        inProgress,
        pending,
        submitted,
        rework,
        overdue,
        progressPercentage: avgProgress,
        completionRate,
      };
    });

    return successResponse(res, 200, "Candidate progress retrieved", {
      candidates: candidatesProgress,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get progress aggregated by team
// @route   GET /api/progress/teams
// @access  Private
export const getTeamProgress = async (req, res, next) => {
  try {
    const candQuery = {};
    if (req.user?.organizationId) {
      candQuery.$or = [{ organizationId: req.user.organizationId }, { organizationId: null }];
    }

    const candidates = await Candidate.find(candQuery);
    const assignments = await TaskAssignment.find().populate("candidate");

    const teamMap = {};

    candidates.forEach((cand) => {
      const team = cand.team || "General";
      if (!teamMap[team]) {
        teamMap[team] = {
          team,
          candidateCount: 0,
          candidateIds: [],
          totalTasks: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          submitted: 0,
          rework: 0,
          overdue: 0,
          totalProgress: 0,
        };
      }
      teamMap[team].candidateCount++;
      teamMap[team].candidateIds.push(cand._id.toString());
    });

    assignments.forEach((a) => {
      if (!a.candidate) return;
      const team = a.candidate.team || "General";
      if (!teamMap[team]) {
        teamMap[team] = {
          team,
          candidateCount: 0,
          candidateIds: [],
          totalTasks: 0,
          completed: 0,
          inProgress: 0,
          pending: 0,
          submitted: 0,
          rework: 0,
          overdue: 0,
          totalProgress: 0,
        };
      }

      teamMap[team].totalTasks++;
      teamMap[team].totalProgress += a.progressPercentage || 0;

      const { isOverdue } = calculateDeadlineStatus(a);
      if (isOverdue) teamMap[team].overdue++;

      if (a.status === "COMPLETED") teamMap[team].completed++;
      else if (a.status === "IN_PROGRESS") teamMap[team].inProgress++;
      else if (a.status === "PENDING") teamMap[team].pending++;
      else if (a.status === "SUBMITTED") teamMap[team].submitted++;
      else if (a.status === "REWORK_REQUIRED") teamMap[team].rework++;
    });

    const teams = Object.values(teamMap).map((t) => {
      const avgProgress = t.totalTasks > 0 ? Math.round(t.totalProgress / t.totalTasks) : 0;
      const avgCompletionRate = t.totalTasks > 0 ? Math.round((t.completed / t.totalTasks) * 100) : 0;
      return {
        ...t,
        averageProgress: avgProgress,
        completionRate: avgCompletionRate,
      };
    });

    return successResponse(res, 200, "Team progress retrieved", { teams });
  } catch (error) {
    next(error);
  }
};

// @desc    Update progress for a specific task assignment
// @route   PUT /api/progress/:assignmentId
// @access  Private
export const updateTaskProgress = async (req, res, next) => {
  try {
    const { progressPercentage, status, notes } = req.body;

    const assignment = await TaskAssignment.findById(req.params.assignmentId).populate("task");
    if (!assignment) {
      return errorResponse(res, 404, "Task assignment not found");
    }

    if (progressPercentage !== undefined) {
      const parsed = parseInt(progressPercentage, 10);
      const prog = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));
      assignment.progressPercentage = prog;

      if ((assignment.status === "PENDING" || assignment.status === "REWORK_REQUIRED") && prog > 0) {
        assignment.status = "IN_PROGRESS";
      }
    }

    if (status && ["PENDING", "IN_PROGRESS", "REWORK_REQUIRED", "COMPLETED"].includes(status)) {
      assignment.status = status;
      if (status === "COMPLETED" && !assignment.completedAt) {
        assignment.completedAt = new Date();
      }
    }

    if (notes !== undefined) {
      assignment.notes = notes;
    }

    await assignment.save();

    const populated = await TaskAssignment.findById(assignment._id)
      .populate("task")
      .populate("candidate")
      .populate("assignedBy", "name email role");

    const deadlineInfo = calculateDeadlineStatus(populated);

    return successResponse(res, 200, "Progress updated successfully", {
      assignment: {
        ...populated.toObject(),
        ...deadlineInfo,
      },
    });
  } catch (error) {
    next(error);
  }
};
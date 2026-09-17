import Candidate, { CANDIDATE_DEPARTMENTS } from "../models/Candidate.js";
import TaskAssignment from "../models/TaskAssignment.js";
import Employees from "../models/UserModel.js";
import Employee from "../models/Employee.js";
import Department from "../models/Department.js";
import { calculateDeadlineStatus } from "../utils/calculateDeadlineStatus.js";
import { successResponse, errorResponse } from "../utils/responseFormatter.js";

// Automatically sync employees into the Candidate model so all HR-added employees appear in Task Allocation / Candidates
export const syncEmployeesToCandidates = async (organizationId = null) => {
    try {
        const filter = {};
        if (organizationId) {
            filter.organizationId = organizationId;
        }
        const employees = await Employee.find(filter)
            .populate("user_id", "name email phone role")
            .populate("department_id", "departmentName");

        for (const emp of employees) {
            const user = emp.user_id;
            if (!user || !user.email) continue;
            // Exclude Super Admin and HR from candidate list (candidates are operational employees)
            const uRole = (user.role || "").trim().toLowerCase();
            if (
                uRole === "super_admin" ||
                uRole === "superadmin" ||
                uRole === "hr" ||
                uRole === "hr manager" ||
                uRole === "hr_manager" ||
                user.email.toLowerCase() === "super@gmail.com"
            ) {
                continue;
            }

            const email = user.email.toLowerCase().trim();
            const name = (user.name || "Employee").trim();
            const deptName = emp.department_id?.departmentName || user.department || "General";
            const desig = (emp.designation || "Employee").trim();
            const phone = user.phone || "";
            const status = emp.employment_status === "Inactive" ? "INACTIVE" : "ACTIVE";
            const empOrgId = emp.organizationId || null;

            let cand = await Candidate.findOne({
                email,
                $or: [{ organizationId: empOrgId }, { organizationId: null }],
            });

            const matchedDept = CANDIDATE_DEPARTMENTS.includes(deptName) ? deptName : "General";
            const matchedTeam = `${deptName} Team`;

            if (!cand) {
                await Candidate.create({
                    name,
                    email,
                    phone,
                    department: matchedDept,
                    designation: desig,
                    team: matchedTeam,
                    joiningDate: emp.date_of_joining || new Date(),
                    status,
                    organizationId: empOrgId,
                });
            } else {
                let updated = false;
                if (cand.name !== name) { cand.name = name; updated = true; }
                if (cand.designation !== desig) { cand.designation = desig; updated = true; }
                if (cand.department !== matchedDept) { cand.department = matchedDept; updated = true; }
                if (cand.status !== status) { cand.status = status; updated = true; }
                if (empOrgId && !cand.organizationId) { cand.organizationId = empOrgId; updated = true; }
                if (updated) await cand.save();
            }
        }
    } catch (err) {
        console.error("[Candidate Sync] Error syncing employees to candidates:", err.message);
    }
};

// @desc    Get all candidates with search, filter, and task summary counts
// @route   GET /api/candidates
// @access  Private (Admin, HR)
export const getCandidates = async (req, res, next) => {
    try {
        // Automatically sync employees to candidates so all HR-added employees appear in candidate lists/dropdowns
        await syncEmployeesToCandidates(req.user?.organizationId);

        const { search, team, department, status, page = 1, limit = 50 } = req.query;

        const query = {};

        // Multi-tenant check: strictly scope to current organization
        const userRole = (req.user?.role || "").trim().toLowerCase();
        const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

        if (!isSuperAdmin) {
            if (!req.user?.organizationId) {
                return successResponse(res, 200, "Candidates fetched successfully", {
                    candidates: [],
                    pagination: { total: 0, page: 1, limit: parseInt(limit, 10), pages: 0 },
                });
            }
            query.organizationId = req.user.organizationId;
        } else if (req.query.organizationId) {
            query.organizationId = req.query.organizationId;
        }

        if (status) {
            query.status = status;
        }

        if (team) {
            query.team = team;
        }

        if (department) {
            query.department = department;
        }

        if (search) {
            const searchRegex = new RegExp(search, "i");
            const searchFilter = [
                { name: searchRegex },
                { email: searchRegex },
                { department: searchRegex },
                { designation: searchRegex },
                { team: searchRegex },
            ];
            if (query.$or) {
                query.$and = [{ $or: query.$or }, { $or: searchFilter }];
                delete query.$or;
            } else {
                query.$or = searchFilter;
            }
        }

        const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
        const total = await Candidate.countDocuments(query);
        const candidates = await Candidate.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit, 10));

        // Aggregate task assignments for each candidate to get real-time statistics
        const candidateIds = candidates.map((c) => c._id);
        const assignments = await TaskAssignment.find({ candidate: { $in: candidateIds } }).populate("task");

        const candidatesWithMetrics = candidates.map((cand) => {
            const candAssignments = assignments.filter(
                (a) => a.candidate.toString() === cand._id.toString()
            );

            const totalTasks = candAssignments.length;
            let completedTasks = 0;
            let pendingTasks = 0;
            let inProgressTasks = 0;
            let submittedTasks = 0;
            let reworkTasks = 0;
            let overdueTasks = 0;

            candAssignments.forEach((a) => {
                const { isOverdue } = calculateDeadlineStatus(a);
                if (isOverdue) overdueTasks++;

                switch (a.status) {
                    case "COMPLETED":
                        completedTasks++;
                        break;
                    case "PENDING":
                        pendingTasks++;
                        break;
                    case "IN_PROGRESS":
                        inProgressTasks++;
                        break;
                    case "SUBMITTED":
                        submittedTasks++;
                        break;
                    case "REWORK_REQUIRED":
                        reworkTasks++;
                        break;
                    default:
                        break;
                }
            });

            const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            return {
                ...cand.toObject(),
                taskStats: {
                    totalTasks,
                    completedTasks,
                    pendingTasks,
                    inProgressTasks,
                    submittedTasks,
                    reworkTasks,
                    overdueTasks,
                    completionRate,
                },
            };
        });

        return successResponse(res, 200, "Candidates fetched successfully", {
            candidates: candidatesWithMetrics,
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

// @desc    Get candidate details with all assignments, submissions, and history
// @route   GET /api/candidates/:id
// @access  Private
export const getCandidateById = async (req, res, next) => {
    try {
        const candidate = await Candidate.findById(req.params.id);

        if (!candidate) {
            return errorResponse(res, 404, "Candidate not found");
        }

        const userRole = (req.user?.role || "").trim().toLowerCase();
        const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";
        if (!isSuperAdmin) {
            const orgId = req.user?.organizationId?.toString();
            const candOrgId = candidate.organizationId?.toString();
            if (!orgId || (candOrgId && orgId !== candOrgId)) {
                return errorResponse(res, 403, "Access denied: Candidate belongs to another organization");
            }
        }

        const assignments = await TaskAssignment.find({ candidate: candidate._id })
            .populate("task")
            .populate("assignedBy", "name email role")
            .sort({ createdAt: -1 });

        const assignmentsWithDetails = assignments.map((a) => {
            const deadlineInfo = calculateDeadlineStatus(a);
            return {
                ...a.toObject(),
                ...deadlineInfo,
            };
        });

        const totalTasks = assignmentsWithDetails.length;
        const completedTasks = assignmentsWithDetails.filter((a) => a.status === "COMPLETED").length;
        const pendingTasks = assignmentsWithDetails.filter((a) => a.status === "PENDING").length;
        const inProgressTasks = assignmentsWithDetails.filter((a) => a.status === "IN_PROGRESS").length;
        const submittedTasks = assignmentsWithDetails.filter((a) => a.status === "SUBMITTED").length;
        const reworkTasks = assignmentsWithDetails.filter((a) => a.status === "REWORK_REQUIRED").length;
        const overdueTasks = assignmentsWithDetails.filter((a) => a.isOverdue).length;

        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        return successResponse(res, 200, "Candidate details retrieved", {
            candidate,
            assignments: assignmentsWithDetails,
            summary: {
                totalTasks,
                completedTasks,
                pendingTasks,
                inProgressTasks,
                submittedTasks,
                reworkTasks,
                overdueTasks,
                completionRate,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new candidate
// @route   POST /api/candidates
// @access  Private (Admin, HR)
export const createCandidate = async (req, res, next) => {
    try {
        const { name, email, phone, department, designation, team, joiningDate, status } = req.body;

        const existingCandidate = await Candidate.findOne({ email: email.toLowerCase().trim() });
        if (existingCandidate) {
            return errorResponse(res, 400, "A candidate with this email already exists");
        }

        const candidate = await Candidate.create({
            name,
            email: email.toLowerCase().trim(),
            phone: phone || "",
            department,
            designation,
            team,
            joiningDate: joiningDate || Date.now(),
            status: status || "ACTIVE",
            organizationId: req.user?.organizationId || null,
        });

        return successResponse(res, 201, "Candidate created successfully", { candidate });
    } catch (error) {
        next(error);
    }
};

// @desc    Update candidate
// @route   PUT /api/candidates/:id
// @access  Private (Admin, HR)
export const updateCandidate = async (req, res, next) => {
    try {
        const { name, email, phone, department, designation, team, status, joiningDate } = req.body;

        const candidate = await Candidate.findById(req.params.id);
        if (!candidate) {
            return errorResponse(res, 404, "Candidate not found");
        }

        if (email && email.toLowerCase().trim() !== candidate.email) {
            const emailExists = await Candidate.findOne({ email: email.toLowerCase().trim(), _id: { $ne: candidate._id } });
            if (emailExists) {
                return errorResponse(res, 400, "Another candidate already uses this email");
            }
        }

        candidate.name = name || candidate.name;
        candidate.email = email ? email.toLowerCase().trim() : candidate.email;
        candidate.phone = phone !== undefined ? phone : candidate.phone;
        candidate.department = department || candidate.department;
        candidate.designation = designation || candidate.designation;
        candidate.team = team || candidate.team;
        candidate.status = status || candidate.status;
        if (joiningDate) candidate.joiningDate = joiningDate;

        await candidate.save();

        return successResponse(res, 200, "Candidate updated successfully", { candidate });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete candidate
// @route   DELETE /api/candidates/:id
// @access  Private (Admin, HR)
export const deleteCandidate = async (req, res, next) => {
    try {
        const candidate = await Candidate.findById(req.params.id);
        if (!candidate) {
            return errorResponse(res, 404, "Candidate not found");
        }

        // Delete associated assignments and candidate
        await TaskAssignment.deleteMany({ candidate: candidate._id });
        await Candidate.findByIdAndDelete(req.params.id);

        return successResponse(res, 200, "Candidate and related assignments deleted successfully");
    } catch (error) {
        next(error);
    }
};

// @desc    Get candidate filters metadata (teams, departments)
// @route   GET /api/candidates/meta/filters
// @access  Private
export const getCandidateFiltersMeta = async (req, res, next) => {
    try {
        const teams = await Candidate.distinct("team");
        const departments = await Candidate.distinct("department");

        return successResponse(res, 200, "Candidate filter metadata fetched", {
            teams: teams.filter(Boolean),
            departments: departments.filter(Boolean),
        });
    } catch (error) {
        next(error);
    }
};
import Employee from "../models/Employee.js";
import User from "../models/UserModel.js";
import Department from "../models/Department.js";
import Organization from "../models/Organization.js";
import { generateNextDepartmentId } from "../services/departmentService.js";
import { syncEmployeesToCandidates } from "./candidateController.js";
import mongoose from "mongoose";
import bcrypt from "bcrypt";


// =====================================================
// HELPER: Generate next sequential Employee Code (e.g. EMP001, EMP002)
// =====================================================
export const generateNextEmployeeCode = async () => {
  const employees = await Employee.find({
    employee_code: { $exists: true, $ne: null, $nin: [""] }
  }).select("employee_code");

  let maxNumber = 0;
  for (const emp of employees) {
    if (emp.employee_code) {
      const match = String(emp.employee_code).match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    }
  }

  const nextNumber = maxNumber + 1;
  return `EMP${String(nextNumber).padStart(3, "0")}`;
};

// =====================================================
// HELPER: Safe Backfill for missing Employee Codes
// =====================================================
export const backfillEmployeeCodes = async () => {
  try {
    const unassigned = await Employee.find({
      $or: [
        { employee_code: { $exists: false } },
        { employee_code: null },
        { employee_code: "" },
      ],
    }).sort({ createdAt: 1 });

    if (unassigned.length === 0) return;

    console.log(`[Backfill] Found ${unassigned.length} employee(s) without employee_code. Assigning codes...`);

    const assigned = await Employee.find({
      employee_code: { $exists: true, $ne: null, $nin: [""] }
    }).select("employee_code");

    let maxNumber = 0;
    for (const emp of assigned) {
      const match = String(emp.employee_code).match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNumber) maxNumber = num;
      }
    }

    for (const emp of unassigned) {
      maxNumber += 1;
      emp.employee_code = `EMP${String(maxNumber).padStart(3, "0")}`;
      await emp.save();
      console.log(`[Backfill] Assigned ${emp.employee_code} to employee ID ${emp._id}`);
    }
  } catch (err) {
    console.error("[Backfill] Error backfilling employee codes:", err.message);
  }
};

// =====================================================
// HELPER: Auto-sync registered users to Employee documents
// =====================================================
export const syncUsersToEmployees = async () => {
  try {
    const allUsers = await User.find({});
    let syncedCount = 0;

    for (const user of allUsers) {
      const exists = await Employee.findOne({ user_id: user._id });
      if (!exists) {
        let deptId = null;
        if (user.department) {
          const deptDoc = await Department.findOne({
            departmentName: { $regex: new RegExp(`^${user.department.trim()}$`, "i") }
          });
          if (deptDoc) {
            deptId = deptDoc._id;
          }
        }
        if (!deptId) {
          let defaultDept = await Department.findOne({});
          if (!defaultDept) {
            defaultDept = await Department.create({
              departmentId: "DEP001",
              departmentName: user.department || "General",
              description: "General Department",
              status: "Active"
            });
          }
          deptId = defaultDept._id;
        }

        const employee_code = await generateNextEmployeeCode();
        const designation =
          user.role === "Admin"
            ? "System Administrator"
            : user.role === "HR Manager"
            ? "HR Manager"
            : "Employee";

        await Employee.create({
          user_id: user._id,
          employee_code,
          department_id: deptId,
          designation,
          manager_id: null,
          date_of_joining: user.createdAt || new Date(),
          employment_status: "Active",
        });
        syncedCount++;
      }
    }

    if (syncedCount > 0) {
      console.log(`[Sync] Automatically synced ${syncedCount} user(s) to Employee directory.`);
    }

    await backfillEmployeeCodes();
  } catch (err) {
    console.error("[Sync] Error syncing users to employees:", err.message);
  }
};

// =====================================================
// 1. CREATE EMPLOYEE
// Admin / HR can create an employee
// =====================================================
export const createEmployee = async (req, res) => {
  try {
    const {
      user_id,
      name,
      email,
      phone,
      role,
      department_id,
      designation,
      manager_id,
      date_of_joining,
      employment_status,
    } = req.body;

    // Required field validation
    if (!department_id) {
      return res.status(400).json({
        success: false,
        message: "Department is required",
      });
    }

    // Resolve department document and ID (handles both ObjectId and Department Name string)
    let resolvedDepartmentId = department_id;
    let deptName = "Human Resource";
    if (mongoose.Types.ObjectId.isValid(department_id)) {
      const deptDoc = await Department.findById(department_id);
      if (deptDoc) {
        deptName = deptDoc.departmentName;
      }
    } else {
      let deptDoc = await Department.findOne({
        departmentName: { $regex: new RegExp(`^${String(department_id).trim()}$`, "i") },
      });
      if (!deptDoc) {
        const nextId = await generateNextDepartmentId();
        deptDoc = await Department.create({
          departmentId: nextId,
          departmentName: String(department_id).trim(),
          description: `${String(department_id).trim()} Department`,
          status: "Active",
        });
      }
      resolvedDepartmentId = deptDoc._id;
      deptName = deptDoc.departmentName;
    }

    if (!designation || !String(designation).trim()) {
      return res.status(400).json({
        success: false,
        message: "Designation is required",
      });
    }

    if (!date_of_joining) {
      return res.status(400).json({
        success: false,
        message: "Date of joining is required",
      });
    }

    // Enforce organization member limit if acting user belongs to an organization
    const orgId = req.user?.organizationId;
    if (orgId && mongoose.Types.ObjectId.isValid(orgId)) {
      const org = await Organization.findById(orgId);
      if (org) {
        const memberCount = await User.countDocuments({
          organizationId: org._id,
          role: { $ne: "SUPER_ADMIN" },
        });
        if (memberCount >= org.memberLimit) {
          return res.status(400).json({
            success: false,
            message: "Organization member limit reached. No additional members can be added.",
          });
        }
      }
    }

    const targetEmail = String(email || user_id || "").trim().toLowerCase();
    let resolvedUserId = null;

    // 1. Check if user_id is provided as a valid ObjectId AND matches targetEmail
    if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
      const existingUser = await User.findById(user_id);
      if (existingUser) {
        // Only use user_id if email matches, or if email was not specified separately
        if (!email || existingUser.email.toLowerCase() === targetEmail) {
          resolvedUserId = existingUser._id;
          if (orgId && !existingUser.organizationId) {
            existingUser.organizationId = orgId;
            await existingUser.save();
          }
        }
      }
    }

    // 2. If not resolved by ObjectId, check or create by email
    if (!resolvedUserId) {
      if (!targetEmail) {
        return res.status(400).json({
          success: false,
          message: "User account selection or email is required",
        });
      }


      // Simple email validation regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(targetEmail)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address",
        });
      }

      let existingUser = await User.findOne({ email: targetEmail });

      if (existingUser) {
        resolvedUserId = existingUser._id;
        // Update user details if provided
        if (name && String(name).trim() && existingUser.name !== name.trim()) {
          existingUser.name = name.trim();
        }
        if (phone) {
          const cleanedPhone = String(phone).replace(/\D/g, "");
          if (cleanedPhone) existingUser.phone = cleanedPhone;
        }
        // Only Super Admin can assign HR or other elevated roles.
        // HR created persons are strictly "Employee".
        const isSuperAdmin = req.user?.role === "SUPER_ADMIN";
        if (isSuperAdmin && role) {
          existingUser.role = role;
        } else {
          existingUser.role = "Employee";
        }
        if (orgId && !existingUser.organizationId) {
          existingUser.organizationId = orgId;
        }
        await existingUser.save();
      } else {
        // Auto-create user account - HR created persons are ALWAYS "Employee"
        const isSuperAdmin = req.user?.role === "SUPER_ADMIN";
        const userName = (name || targetEmail.split("@")[0] || "Employee").trim();
        const userPhone = phone ? String(phone).replace(/\D/g, "") : "0000000000";
        const userRole = isSuperAdmin && role ? role : "Employee";

        // Generate strong hashed password that matches policy: Emp@12345
        const defaultHash = await bcrypt.hash("Emp@12345", 10);

        existingUser = await User.create({
          name: userName,
          email: targetEmail,
          phone: userPhone.length === 10 ? userPhone : "9876543210",
          password: defaultHash,
          role: userRole,
          department: deptName,
          organizationId: orgId || null,
        });

        resolvedUserId = existingUser._id;
      }
    }

    // Check if user is already linked to an employee
    const existingEmployee = await Employee.findOne({ user_id: resolvedUserId });

    if (existingEmployee) {
      return res.status(409).json({
        success: false,
        message: "This user is already registered as an employee",
      });
    }

    // Generate unique backend Employee Code
    const employee_code = await generateNextEmployeeCode();

    // Create employee record
    const employee = await Employee.create({
      user_id: resolvedUserId,
      employee_code,
      department_id: resolvedDepartmentId,
      designation: String(designation).trim(),
      manager_id: manager_id && mongoose.Types.ObjectId.isValid(manager_id) ? manager_id : null,
      date_of_joining,
      employment_status: employment_status || "Active",
      organizationId: orgId || null,
    });


    // Automatically sync newly added employee to Candidate collection for CETMS Task Allocation
    try {
      await syncEmployeesToCandidates(orgId || null);
    } catch (syncErr) {
      console.error("[Candidate Sync] Error syncing new employee:", syncErr.message);
    }

    // Return populated employee data
    const populatedEmployee = await Employee.findById(employee._id)
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation");

    return res.status(201).json({
      success: true,
      message: "Employee created successfully",
      employee: populatedEmployee,
    });
  } catch (error) {
    console.error("CREATE EMPLOYEE ERROR:", error);

    // Duplicate key error handler
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(409).json({
        success: false,
        message: `An employee with this ${field} already exists.`,
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Error creating employee",
    });
  }
};

// =====================================================
// 2. GET ALL EMPLOYEES
// Search + Pagination + Status Filter
// =====================================================
export const getAllEmployees = async (req, res) => {
  try {
    const {
      search = "",
      status,
      page = 1,
      limit = 10,
    } = req.query;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNumber - 1) * limitNumber;

    // Build filter
    const filter = {};

    if (status) {
      filter.employment_status = status;
    }

    // Search employee code, designation, or populated user name/email
    if (search && String(search).trim()) {
      const trimmedSearch = String(search).trim();
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: trimmedSearch, $options: "i" } },
          { email: { $regex: trimmedSearch, $options: "i" } },
        ],
      }).select("_id");

      const userIds = matchingUsers.map((u) => u._id);

      filter.$or = [
        { employee_code: { $regex: trimmedSearch, $options: "i" } },
        { designation: { $regex: trimmedSearch, $options: "i" } },
        { user_id: { $in: userIds } },
      ];
    }

    // Data Isolation & Role Rules
    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";

    if (!isSuperAdmin) {
      const orgId = req.user?.organizationId;
      if (!orgId) {
        return res.status(200).json({
          success: true,
          message: "No organization assigned",
          totalEmployees: 0,
          currentPage: pageNumber,
          totalPages: 0,
          employees: [],
        });
      }

      // Exclude HR and Super Admin users from the operational employees directory
      const excludedUsers = await User.find({
        role: {
          $in: [
            "SUPER_ADMIN",
            "super_admin",
            "Super Admin",
            "HR",
            "HR Manager",
            "hr_manager",
            "hr",
            "Human Resources",
          ],
        },
      }).select("_id");
      const excludedUserIds = excludedUsers.map((u) => u._id);

      const orgUsers = await User.find({
        organizationId: orgId,
        _id: { $nin: excludedUserIds },
      }).select("_id");
      const orgUserIds = orgUsers.map((u) => u._id);

      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { organizationId: orgId },
          { user_id: { $in: orgUserIds } },
        ],
        user_id: { $in: orgUserIds },
      });
    } else if (req.query.organizationId) {
      filter.organizationId = req.query.organizationId;
    }

    const totalEmployees = await Employee.countDocuments(filter);

    let queryBuilder = Employee.find(filter)
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // If caller is regular Employee, strip private compensation/banking details
    if (userRole === "employee") {
      queryBuilder = queryBuilder.select("-month_salary -account_number -ifsc_code -pan_number -aadhaar_number");
    }

    const employees = await queryBuilder;

    return res.status(200).json({
      success: true,
      message: "Employees fetched successfully",
      totalEmployees,
      currentPage: pageNumber,
      totalPages: Math.ceil(totalEmployees / limitNumber) || 1,
      employees,
    });
  } catch (error) {
    console.error("GET ALL EMPLOYEES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching employees",
      error: error.message,
    });
  }
};

// =====================================================
// 3. GET SINGLE EMPLOYEE
// =====================================================
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID format",
      });
    }

    const employee = await Employee.findById(id)
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";
    if (!isSuperAdmin) {
      const orgId = req.user?.organizationId?.toString();
      const empOrgId = employee.organizationId?.toString();
      if (!orgId || (empOrgId && orgId !== empOrgId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Employee does not belong to your organization",
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Employee fetched successfully",
      employee,
    });
  } catch (error) {
    console.error("GET EMPLOYEE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching employee",
      error: error.message,
    });
  }
};

// =====================================================
// 4. UPDATE EMPLOYEE
// Admin / HR can update employee & user details
// =====================================================
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID format",
      });
    }

    const {
      department_id,
      designation,
      manager_id,
      date_of_joining,
      employment_status,
      name,
      email,
      phone,
      role,
    } = req.body;

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";
    if (!isSuperAdmin) {
      const orgId = req.user?.organizationId?.toString();
      const empOrgId = employee.organizationId?.toString();
      if (!orgId || (empOrgId && orgId !== empOrgId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Employee does not belong to your organization",
        });
      }
    }

    // Update Employee document fields
    if (department_id !== undefined && department_id) {
      if (mongoose.Types.ObjectId.isValid(department_id)) {
        employee.department_id = department_id;
      } else {
        let foundDept = await Department.findOne({
          departmentName: { $regex: new RegExp(`^${String(department_id).trim()}$`, "i") },
        });
        if (!foundDept) {
          const nextId = await generateNextDepartmentId();
          foundDept = await Department.create({
            departmentId: nextId,
            departmentName: String(department_id).trim(),
            description: `${String(department_id).trim()} Department`,
            status: "Active",
          });
        }
        employee.department_id = foundDept._id;
      }
    }
    if (designation !== undefined && String(designation).trim()) {
      employee.designation = String(designation).trim();
    }
    if (manager_id !== undefined) {
      employee.manager_id = manager_id && mongoose.Types.ObjectId.isValid(manager_id) ? manager_id : null;
    }
    if (date_of_joining !== undefined && date_of_joining) {
      employee.date_of_joining = date_of_joining;
    }
    if (employment_status !== undefined) {
      employee.employment_status = employment_status;
    }

    await employee.save();

    // Update linked User document fields
    if (employee.user_id) {
      const user = await User.findById(employee.user_id);
      if (user) {
        // Check email uniqueness if email is updated
        if (email !== undefined && email) {
          const trimmedEmail = String(email).trim().toLowerCase();
          if (trimmedEmail !== user.email) {
            const emailInUse = await User.findOne({
              email: trimmedEmail,
              _id: { $ne: user._id },
            });
            if (emailInUse) {
              return res.status(409).json({
                success: false,
                message: "Email is already in use by another account",
              });
            }
            user.email = trimmedEmail;
          }
        }

        if (name !== undefined && String(name).trim()) {
          user.name = String(name).trim();
        }

        if (phone !== undefined) {
          const cleanedPhone = String(phone).replace(/\D/g, "");
          if (cleanedPhone) user.phone = cleanedPhone;
        }

        if (role !== undefined && String(role).trim()) {
          const isSuperAdmin = req.user?.role === "SUPER_ADMIN";
          if (isSuperAdmin) {
            user.role = String(role).trim();
          } else {
            user.role = "Employee";
          }
        }

        if (department_id !== undefined && department_id && mongoose.Types.ObjectId.isValid(department_id)) {
          const deptDoc = await Department.findById(department_id);
          if (deptDoc) user.department = deptDoc.departmentName;
        }

        await user.save();
      }
    }

    try {
      await syncEmployeesToCandidates(employee.organizationId || null);
    } catch (syncErr) {
      console.error("[Candidate Sync] Error syncing updated employee:", syncErr.message);
    }

    const updatedEmployee = await Employee.findById(employee._id)
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation");

    return res.status(200).json({
      success: true,
      message: "Employee updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    console.error("UPDATE EMPLOYEE ERROR:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate value conflict occurred during update.",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Error updating employee",
    });
  }
};

// =====================================================
// 5. DELETE / DEACTIVATE EMPLOYEE
// Soft deletion: sets status to Inactive to preserve historical data
// =====================================================
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID format",
      });
    }

    const employee = await Employee.findById(id);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    const userRole = (req.user?.role || "").trim().toLowerCase();
    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin";
    if (!isSuperAdmin) {
      const orgId = req.user?.organizationId?.toString();
      const empOrgId = employee.organizationId?.toString();
      if (!orgId || (empOrgId && orgId !== empOrgId)) {
        return res.status(403).json({
          success: false,
          message: "Access denied: Employee does not belong to your organization",
        });
      }
    }

    // Preserve historical attendance, leave, payroll, and references:
    // Mark as Inactive instead of hard deleting
    employee.employment_status = "Inactive";
    await employee.save();

    return res.status(200).json({
      success: true,
      message: "Employee deactivated successfully",
      employee,
    });
  } catch (error) {
    console.error("DELETE EMPLOYEE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error deactivating employee",
      error: error.message,
    });
  }
};

// =====================================================
// 6. UPDATE EMPLOYEE STATUS
// Active / Inactive
// =====================================================
export const updateEmployeeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { employment_status } = req.body;

    if (!["Active", "Inactive"].includes(employment_status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be Active or Inactive",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Employee ID format",
      });
    }

    const employee = await Employee.findByIdAndUpdate(
      id,
      { employment_status },
      { returnDocument: "after", runValidators: true }
    )
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Employee status updated successfully",
      employee,
    });
  } catch (error) {
    console.error("UPDATE EMPLOYEE STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating employee status",
      error: error.message,
    });
  }
};

// =====================================================
// 7. GET LOGGED-IN EMPLOYEE PROFILE
// Uses Team 1 JWT: req.user.id
// =====================================================
export const getMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const employee = await Employee.findOne({ user_id: userId })
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation");

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      employee,
    });
  } catch (error) {
    console.error("GET MY PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error fetching profile",
      error: error.message,
    });
  }
};

// =====================================================
// 8. UPDATE LOGGED-IN EMPLOYEE PROFILE
// Employee can update allowed profile fields
// =====================================================
export const updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      designation,
      manager_id,
      date_of_joining,
    } = req.body;

    const employee = await Employee.findOne({ user_id: userId });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee profile not found",
      });
    }

    // Employee can update only allowed fields
    if (designation !== undefined && String(designation).trim()) {
      employee.designation = String(designation).trim();
    }

    if (manager_id !== undefined) {
      employee.manager_id = manager_id && mongoose.Types.ObjectId.isValid(manager_id) ? manager_id : null;
    }

    if (date_of_joining !== undefined && date_of_joining) {
      employee.date_of_joining = date_of_joining;
    }

    await employee.save();

    const updatedEmployee = await Employee.findById(employee._id)
      .populate("user_id", "name email role phone")
      .populate(
        "department_id",
        "departmentId departmentName description location status"
      )
      .populate("manager_id", "employee_code designation");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    console.error("UPDATE MY PROFILE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};
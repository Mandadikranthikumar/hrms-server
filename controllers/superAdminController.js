import bcrypt from "bcrypt";
import mongoose from "mongoose";
import Organization from "../models/Organization.js";
import UserModel from "../models/UserModel.js";
import Employee from "../models/Employee.js";
import Department from "../models/Department.js";
import { generateNextEmployeeCode } from "./EmployeeController.js";

// =====================================================
// HELPER: Auto-generate unique organization code (ORG001, ORG002, ...)
// =====================================================
const generateNextOrgCode = async () => {
  const orgs = await Organization.find({
    orgCode: { $exists: true, $ne: null, $nin: [""] }
  }).select("orgCode");

  let maxNum = 0;
  for (const org of orgs) {
    if (org.orgCode) {
      const match = String(org.orgCode).match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }

  return `ORG${String(maxNum + 1).padStart(3, "0")}`;
};

// =====================================================
// 1. SEED / INITIALIZE SUPER ADMIN
// =====================================================
export const seedSuperAdmin = async () => {
  try {
    const email = (process.env.SUPER_ADMIN_EMAIL || "super@gmail.com").trim().toLowerCase();
    const rawPassword = process.env.SUPER_ADMIN_PASSWORD || "super_admin@123";

    const existingAdmin = await UserModel.findOne({ email });
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(rawPassword, 10);
      await UserModel.create({
        name: "Super Admin",
        email,
        password: hashedPassword,
        role: "SUPER_ADMIN",
        department: "Executive Administration",
        phone: "0000000000",
        organizationId: null,
      });
      console.log(`[SuperAdmin] Initialized Super Admin account: ${email}`);
    } else if (existingAdmin.role !== "SUPER_ADMIN") {
      existingAdmin.role = "SUPER_ADMIN";
      await existingAdmin.save();
      console.log(`[SuperAdmin] Updated existing account to SUPER_ADMIN: ${email}`);
    }

    // Drop legacy code_1 and slug_1 indexes if they exist in MongoDB
    try {
      await Organization.collection.dropIndex("code_1");
      console.log("[SuperAdmin] Dropped legacy code_1 index from organizations collection");
    } catch (dropErr) {}
    try {
      await Organization.collection.dropIndex("slug_1");
      console.log("[SuperAdmin] Dropped legacy slug_1 index from organizations collection");
    } catch (dropErr) {}
  } catch (err) {
    console.error("[SuperAdmin] Initialization error:", err.message);
  }
};


// =====================================================
// 2. DASHBOARD STATS
// =====================================================
export const getDashboardStats = async (req, res) => {
  try {
    const totalOrganizations = await Organization.countDocuments();
    const activeOrganizations = await Organization.countDocuments({ status: "Active" });
    const inactiveOrganizations = await Organization.countDocuments({ status: "Inactive" });

    // Total HR Managers
    const totalHR = await UserModel.countDocuments({
      role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
    });

    // Total Members across all organizations (excluding Super Admin)
    const totalMembers = await UserModel.countDocuments({
      organizationId: { $ne: null },
      role: { $ne: "SUPER_ADMIN" }
    });

    // Total Capacity across all active organizations
    const orgs = await Organization.find();
    const totalCapacity = orgs.reduce((sum, o) => sum + (Number(o.memberLimit) || 0), 0);
    const capacityUtilization = totalCapacity > 0 ? Math.round((totalMembers / totalCapacity) * 100) : 0;

    // Recent 5 Organizations enriched with HR details
    const recentOrganizations = await Promise.all(
      (await Organization.find().sort({ createdAt: -1 }).limit(5)).map(async (org) => {
        const memberCount = await UserModel.countDocuments({
          organizationId: org._id,
          role: { $ne: "SUPER_ADMIN" }
        });
        const hrUser = await UserModel.findOne({
          organizationId: org._id,
          role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
        }).select("name email phone");

        return {
          ...org.toObject(),
          hrName: hrUser ? hrUser.name : (org.contactEmail ? "Unassigned HR" : "-"),
          hrEmail: hrUser ? hrUser.email : (org.contactEmail || "-"),
          hrPhone: hrUser ? hrUser.phone : (org.contactPhone || "-"),
          currentMemberCount: memberCount,
          remainingSlots: Math.max(0, org.memberLimit - memberCount),
        };
      })
    );

    // Recent 5 HR accounts
    const recentHR = await UserModel.find({
      role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
    })
      .select("-password")
      .populate("organizationId", "name orgCode")
      .sort({ createdAt: -1 })
      .limit(5);

    return res.status(200).json({
      success: true,
      stats: {
        totalOrganizations,
        activeOrganizations,
        inactiveOrganizations,
        totalHR,
        totalMembers,
        totalCapacity,
        capacityUtilization,
        recentOrganizations,
        recentHR
      }
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard statistics",
      error: err.message
    });
  }
};

// =====================================================
// 3. CREATE ORGANIZATION (Unified with HR Creation)
// =====================================================
export const createOrganization = async (req, res) => {
  let createdOrgId = null;
  try {
    const {
      name,
      orgCode,
      memberLimit,
      status,
      address,
      hrName,
      hrEmail,
      hrPhone,
      hrPassword,
      contactEmail,
      contactPhone,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        message: "Organization name is required"
      });
    }

    const trimmedName = String(name).trim();

    // Determine Organization Code / ID
    let code = (orgCode || "").trim().toUpperCase();
    if (!code) {
      code = await generateNextOrgCode();
    } else {
      const existingCode = await Organization.findOne({ orgCode: code });
      if (existingCode) {
        // If this organization exists with 0 members and no HR, clean up previous failed attempt
        const memberCount = await UserModel.countDocuments({ organizationId: existingCode._id });
        if (memberCount === 0) {
          await Organization.findByIdAndDelete(existingCode._id);
        } else {
          return res.status(409).json({
            success: false,
            message: `Organization ID "${code}" already exists. Please choose a unique ID.`
          });
        }
      }
    }

    const limit = memberLimit !== undefined && !isNaN(Number(memberLimit))
      ? Math.max(1, parseInt(memberLimit, 10))
      : 50;

    const finalEmail = (hrEmail || contactEmail || "").trim().toLowerCase();
    const finalPhone = (hrPhone || contactPhone || "").trim();

    // Validate HR password regex if provided
    if (hrName && finalEmail && hrPassword) {
      const passwordRegex = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*]).{8,}$/;
      if (!passwordRegex.test(hrPassword)) {
        return res.status(400).json({
          success: false,
          message: "HR Password must contain at least 8 characters, one uppercase letter, one number, and one special character (!@#$%^&*)"
        });
      }
    }

    // If HR email is provided, validate email uniqueness before creating organization
    if (finalEmail) {
      const existingUser = await UserModel.findOne({ email: finalEmail });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: `Email "${finalEmail}" already exists in the system. Please use a unique email for HR.`
        });
      }
    }

    // Ensure legacy code_1 and slug_1 indexes do not conflict
    try {
      await Organization.collection.dropIndex("code_1");
    } catch (dropErr) {}
    try {
      await Organization.collection.dropIndex("slug_1");
    } catch (dropErr) {}

    // 1. Create Organization
    const organization = await Organization.create({
      name: trimmedName,
      orgCode: code,
      code: code,
      memberLimit: limit,
      currentMemberCount: 0,
      status: status === "Inactive" ? "Inactive" : "Active",
      contactEmail: finalEmail,
      contactPhone: finalPhone,
      address: (address || "").trim(),
      createdBy: req.user?.id || null
    });

    createdOrgId = organization._id;

    // 2. Automatically Create HR under this organization if HR details provided
    let createdHR = null;
    if (hrName && finalEmail) {
      const passwordToHash = hrPassword || "Hr@12345";
      const hashedPassword = await bcrypt.hash(passwordToHash, 10);
      const cleanedPhone = finalPhone ? String(finalPhone).replace(/\D/g, "") : "9876543210";

      createdHR = await UserModel.create({
        name: String(hrName).trim(),
        email: finalEmail,
        phone: cleanedPhone.length === 10 ? cleanedPhone : "9876543210",
        department: "Human Resources",
        password: hashedPassword,
        role: "HR",
        organizationId: organization._id,
      });

      // Create linked Employee record for HR
      try {
        let deptDoc = await Department.findOne({
          departmentName: { $regex: /^(HR|Human Resources)$/i }
        });
        if (!deptDoc) {
          deptDoc = await Department.findOne({});
          if (!deptDoc) {
            deptDoc = await Department.create({
              departmentId: "DEP001",
              departmentName: "Human Resources",
              description: "HR Department",
              status: "Active"
            });
          }
        }

        const employee_code = await generateNextEmployeeCode();
        await Employee.create({
          user_id: createdHR._id,
          employee_code,
          department_id: deptDoc._id,
          designation: "HR Manager",
          manager_id: null,
          date_of_joining: new Date(),
          employment_status: "Active",
          organizationId: organization._id,
        });
      } catch (empErr) {
        console.error("Auto-creating employee record for HR failed:", empErr.message);
      }

      organization.currentMemberCount = 1;
      await organization.save();
    }

    return res.status(201).json({
      success: true,
      message: `Organization "${organization.name}" and HR ${createdHR ? `"${createdHR.name}"` : ""} saved successfully`,
      organization,
      hr: createdHR
    });
  } catch (err) {
    console.error("Create organization error:", err);
    // If organization was created but subsequent operations failed, clean up to avoid orphaned records
    if (createdOrgId) {
      try {
        await Organization.findByIdAndDelete(createdOrgId);
      } catch (cleanupErr) {
        console.error("Failed to clean up orphaned organization:", cleanupErr.message);
      }
    }
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to create organization",
      error: err.message
    });
  }
};


// =====================================================
// 4. GET ALL ORGANIZATIONS (with HR details & live counts)
// =====================================================
export const getAllOrganizations = async (req, res) => {
  try {
    const orgs = await Organization.find().sort({ createdAt: -1 });

    const organizationsWithUsage = await Promise.all(
      orgs.map(async (org) => {
        const memberCount = await UserModel.countDocuments({
          organizationId: org._id,
          role: { $ne: "SUPER_ADMIN" }
        });

        const hrUsers = await UserModel.find({
          organizationId: org._id,
          role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
        }).select("-password");

        const primaryHR = hrUsers[0] || null;
        const hrCount = hrUsers.length;
        const employeeCount = Math.max(0, memberCount - hrCount);
        const remainingSlots = Math.max(0, org.memberLimit - memberCount);
        const utilizationPercentage = org.memberLimit > 0
          ? Math.min(100, Math.round((memberCount / org.memberLimit) * 100))
          : 0;

        return {
          ...org.toObject(),
          hrName: primaryHR ? primaryHR.name : (org.contactEmail ? "Unassigned HR" : "-"),
          hrEmail: primaryHR ? primaryHR.email : (org.contactEmail || "-"),
          hrPhone: primaryHR ? primaryHR.phone : (org.contactPhone || "-"),
          hrId: primaryHR ? primaryHR._id : null,
          hrUsers,
          currentMemberCount: memberCount,
          hrCount,
          employeeCount,
          remainingSlots,
          utilizationPercentage,
          isAtLimit: memberCount >= org.memberLimit
        };
      })
    );

    return res.status(200).json({
      success: true,
      organizations: organizationsWithUsage
    });
  } catch (err) {
    console.error("Get all organizations error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organizations",
      error: err.message
    });
  }
};

// =====================================================
// 5. GET ORGANIZATION EMPLOYEES (For "View" Action)
// =====================================================
export const getOrganizationEmployees = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid organization ID" });
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    // Find all users associated with this organization
    const orgUsers = await UserModel.find({
      organizationId: org._id,
      role: { $ne: "SUPER_ADMIN" }
    }).select("-password");

    const userIds = orgUsers.map((u) => u._id);

    // Find corresponding employee records
    const employeeDocs = await Employee.find({
      user_id: { $in: userIds }
    })
      .populate("department_id", "departmentName")
      .sort({ createdAt: -1 });

    const employeesList = orgUsers.map((u) => {
      const empDoc = employeeDocs.find((e) => String(e.user_id) === String(u._id));
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || "-",
        role: u.role,
        department: empDoc?.department_id?.departmentName || u.department || "General",
        designation: empDoc?.designation || (u.role === "HR" ? "HR Manager" : "Employee"),
        employeeCode: empDoc?.employee_code || "-",
        dateOfJoining: empDoc?.date_of_joining || u.createdAt,
        status: empDoc?.employment_status || "Active",
      };
    });

    return res.status(200).json({
      success: true,
      organization: {
        id: org._id,
        name: org.name,
        orgCode: org.orgCode,
        memberLimit: org.memberLimit,
        currentMemberCount: orgUsers.length,
      },
      employees: employeesList
    });
  } catch (err) {
    console.error("Get organization employees error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization employees",
      error: err.message
    });
  }
};

// =====================================================
// 6. GET ORGANIZATION BY ID
// =====================================================
export const getOrganizationById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid organization ID" });
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    const hrUsers = await UserModel.find({
      organizationId: org._id,
      role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
    }).select("-password");

    const memberCount = await UserModel.countDocuments({
      organizationId: org._id,
      role: { $ne: "SUPER_ADMIN" }
    });

    const remainingSlots = Math.max(0, org.memberLimit - memberCount);

    return res.status(200).json({
      success: true,
      organization: {
        ...org.toObject(),
        currentMemberCount: memberCount,
        remainingSlots
      },
      hrUsers
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization details",
      error: err.message
    });
  }
};

// =====================================================
// 7. UPDATE ORGANIZATION & HR (For "Edit" Action)
// =====================================================
export const updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid organization ID" });
    }

    const {
      name,
      orgCode,
      memberLimit,
      status,
      hrName,
      hrEmail,
      hrPhone,
      contactEmail,
      contactPhone,
      address
    } = req.body;

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    if (name !== undefined) org.name = String(name).trim();
    if (orgCode !== undefined) {
      const newCode = String(orgCode).trim().toUpperCase();
      if (newCode && newCode !== org.orgCode) {
        const codeExists = await Organization.findOne({ orgCode: newCode, _id: { $ne: org._id } });
        if (codeExists) {
          return res.status(409).json({ success: false, message: `Organization ID "${newCode}" already exists.` });
        }
        org.orgCode = newCode;
        org.code = newCode;
      }
    }

    if (status !== undefined) org.status = status === "Inactive" ? "Inactive" : "Active";
    if (memberLimit !== undefined) {
      const parsed = parseInt(memberLimit, 10);
      if (!isNaN(parsed) && parsed >= 1) {
        org.memberLimit = parsed;
      }
    }

    const finalHREmail = (hrEmail || contactEmail || "").trim().toLowerCase();
    const finalHRPhone = (hrPhone || contactPhone || "").trim();

    if (finalHREmail) org.contactEmail = finalHREmail;
    if (finalHRPhone) org.contactPhone = finalHRPhone;
    if (address !== undefined) org.address = String(address).trim();

    await org.save();

    // Update or link HR Manager in database
    let hrUser = await UserModel.findOne({
      organizationId: org._id,
      role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
    });

    if (hrUser) {
      if (hrName) hrUser.name = String(hrName).trim();
      if (finalHRPhone) {
        const cleaned = finalHRPhone.replace(/\D/g, "");
        if (cleaned.length === 10) hrUser.phone = cleaned;
      }
      if (finalHREmail && finalHREmail !== hrUser.email) {
        const emailTaken = await UserModel.findOne({ email: finalHREmail, _id: { $ne: hrUser._id } });
        if (emailTaken) {
          return res.status(409).json({ success: false, message: `Email "${finalHREmail}" is already in use by another user.` });
        }
        hrUser.email = finalHREmail;
      }
      await hrUser.save();
    } else if (hrName && finalHREmail) {
      // If no HR currently linked, check if user exists or create new
      let existing = await UserModel.findOne({ email: finalHREmail });
      if (existing) {
        existing.organizationId = org._id;
        existing.role = "HR";
        if (hrName) existing.name = String(hrName).trim();
        await existing.save();
      } else {
        const defaultHash = await bcrypt.hash("Hr@12345", 10);
        await UserModel.create({
          name: String(hrName).trim(),
          email: finalHREmail,
          phone: finalHRPhone ? finalHRPhone.replace(/\D/g, "") : "9876543210",
          password: defaultHash,
          role: "HR",
          department: "Human Resources",
          organizationId: org._id
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Organization and HR details updated successfully in database",
      organization: org
    });
  } catch (err) {
    console.error("Update organization error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update organization",
      error: err.message
    });
  }
};

// =====================================================
// 8. TOGGLE ORGANIZATION STATUS (Active / Inactive)
// =====================================================
export const toggleOrganizationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid organization ID" });
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    if (status) {
      org.status = status === "Active" ? "Active" : "Inactive";
    } else {
      org.status = org.status === "Active" ? "Inactive" : "Active";
    }

    await org.save();

    return res.status(200).json({
      success: true,
      message: `Organization "${org.name}" status updated to ${org.status}`,
      status: org.status
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to toggle organization status",
      error: err.message
    });
  }
};

// =====================================================
// 9. UPDATE ORGANIZATION MEMBER LIMIT
// =====================================================
export const updateOrganizationLimit = async (req, res) => {
  try {
    const { id } = req.params;
    const { memberLimit } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid organization ID" });
    }

    const parsedLimit = parseInt(memberLimit, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({
        success: false,
        message: "Member limit must be a positive number of at least 1"
      });
    }

    const org = await Organization.findById(id);
    if (!org) {
      return res.status(404).json({ success: false, message: "Organization not found" });
    }

    const currentMembers = await UserModel.countDocuments({
      organizationId: org._id,
      role: { $ne: "SUPER_ADMIN" }
    });

    org.memberLimit = parsedLimit;
    org.currentMemberCount = currentMembers;
    await org.save();

    return res.status(200).json({
      success: true,
      message: "Organization member limit updated successfully",
      organization: {
        ...org.toObject(),
        currentMemberCount: currentMembers,
        remainingSlots: Math.max(0, parsedLimit - currentMembers)
      }
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update member limit",
      error: err.message
    });
  }
};

// =====================================================
// 10. CREATE HR UNDER ORGANIZATION (Manual Standalone Endpoint)
// =====================================================
export const createHR = async (req, res) => {
  try {
    const {
      organizationId,
      name,
      email,
      phone,
      password,
      department
    } = req.body;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Please select an organization for this HR"
      });
    }

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(organizationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid organization ID format"
      });
    }

    const org = await Organization.findById(organizationId);
    if (!org) {
      return res.status(404).json({
        success: false,
        message: "Selected organization not found"
      });
    }

    if (org.status !== "Active") {
      return res.status(400).json({
        success: false,
        message: "Cannot add HR to an inactive organization"
      });
    }

    const currentMemberCount = await UserModel.countDocuments({
      organizationId: org._id,
      role: { $ne: "SUPER_ADMIN" }
    });

    if (currentMemberCount >= org.memberLimit) {
      return res.status(400).json({
        success: false,
        message: "Organization member limit reached. No additional members can be added."
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await UserModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already exists. Try another one"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const cleanedPhone = phone ? String(phone).replace(/\D/g, "") : "";

    const newHR = new UserModel({
      name: String(name).trim(),
      email: normalizedEmail,
      phone: cleanedPhone || "9876543210",
      department: (department || "Human Resources").trim(),
      password: hashedPassword,
      role: "HR",
      organizationId: org._id
    });

    await newHR.save();

    try {
      let deptDoc = await Department.findOne({
        departmentName: { $regex: new RegExp(`^${(department || "HR").trim()}$`, "i") }
      });
      if (!deptDoc) {
        deptDoc = await Department.findOne({});
      }

      const employee_code = await generateNextEmployeeCode();
      await Employee.create({
        user_id: newHR._id,
        employee_code,
        department_id: deptDoc?._id,
        designation: "HR Manager",
        manager_id: null,
        date_of_joining: new Date(),
        employment_status: "Active",
        organizationId: org._id
      });
    } catch (empSyncErr) {
      console.error("[CreateHR] Warning: auto-creating employee record:", empSyncErr.message);
    }

    org.currentMemberCount = currentMemberCount + 1;
    await org.save();

    return res.status(201).json({
      success: true,
      message: `HR account for ${newHR.name} created and associated with ${org.name} successfully`,
      user: {
        id: newHR._id,
        name: newHR.name,
        email: newHR.email,
        phone: newHR.phone,
        department: newHR.department,
        role: newHR.role,
        organizationId: org._id,
        organizationName: org.name,
        orgCode: org.orgCode
      }
    });
  } catch (err) {
    console.error("Create HR error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create HR account",
      error: err.message
    });
  }
};

// =====================================================
// 11. GET ALL HR ACCOUNTS
// =====================================================
export const getAllHR = async (req, res) => {
  try {
    const hrUsers = await UserModel.find({
      role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
    })
      .select("-password")
      .populate("organizationId", "name orgCode memberLimit status")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      hrUsers
    });
  } catch (err) {
    console.error("Get all HR error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch HR users",
      error: err.message
    });
  }
};

// =====================================================
// 12. UPDATE HR ACCOUNT
// =====================================================
export const updateHR = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, department, organizationId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid HR user ID" });
    }

    const hr = await UserModel.findById(id);
    if (!hr) {
      return res.status(404).json({ success: false, message: "HR user not found" });
    }

    if (name !== undefined) hr.name = String(name).trim();
    if (phone !== undefined) {
      const cleaned = String(phone).replace(/\D/g, "");
      if (cleaned.length === 10) hr.phone = cleaned;
    }
    if (department !== undefined) hr.department = String(department).trim();

    if (organizationId !== undefined) {
      if (organizationId === null) {
        hr.organizationId = null;
      } else if (mongoose.Types.ObjectId.isValid(organizationId)) {
        const org = await Organization.findById(organizationId);
        if (!org) {
          return res.status(404).json({ success: false, message: "Target organization not found" });
        }
        hr.organizationId = org._id;
      }
    }

    await hr.save();

    const populated = await UserModel.findById(hr._id)
      .select("-password")
      .populate("organizationId", "name orgCode");

    return res.status(200).json({
      success: true,
      message: "HR details updated successfully",
      user: populated
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update HR details",
      error: err.message
    });
  }
};

// =====================================================
// 13. ORGANIZATION USAGE & LIMITS OVERVIEW
// =====================================================
export const getOrganizationUsage = async (req, res) => {
  try {
    const orgs = await Organization.find().sort({ name: 1 });

    let totalCapacity = 0;
    let totalMembers = 0;

    const breakdown = await Promise.all(
      orgs.map(async (org) => {
        const memberCount = await UserModel.countDocuments({
          organizationId: org._id,
          role: { $ne: "SUPER_ADMIN" }
        });

        const hrCount = await UserModel.countDocuments({
          organizationId: org._id,
          role: { $in: ["HR", "HR Manager", "hr_manager", "hr"] }
        });

        const employeeCount = Math.max(0, memberCount - hrCount);
        const limit = Number(org.memberLimit) || 0;
        const remainingSlots = Math.max(0, limit - memberCount);
        const utilizationPercentage = limit > 0
          ? Math.min(100, Math.round((memberCount / limit) * 100))
          : 0;

        totalCapacity += limit;
        totalMembers += memberCount;

        return {
          id: org._id,
          name: org.name,
          orgCode: org.orgCode,
          status: org.status,
          memberLimit: limit,
          currentMemberCount: memberCount,
          hrCount,
          employeeCount,
          remainingSlots,
          utilizationPercentage,
          isNearCapacity: utilizationPercentage >= 80,
          isAtLimit: memberCount >= limit
        };
      })
    );

    const overallRemaining = Math.max(0, totalCapacity - totalMembers);
    const overallUtilization = totalCapacity > 0
      ? Math.round((totalMembers / totalCapacity) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      summary: {
        totalCapacity,
        totalMembers,
        totalRemaining: overallRemaining,
        overallUtilization,
        totalOrganizations: orgs.length
      },
      breakdown
    });
  } catch (err) {
    console.error("Get organization usage error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch organization usage data",
      error: err.message
    });
  }
};

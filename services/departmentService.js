import Department from "../models/Department.js";

const DEFAULT_DEPARTMENTS_SEED = [
  { departmentName: "Human Resource", description: "Human Resource Department" },
  { departmentName: "HR", description: "HR Operations" },
  { departmentName: "Manager", description: "Management Department" },
  { departmentName: "Employee", description: "General Staff & Employees" },
  { departmentName: "Sales", description: "Sales & Marketing Department" },
  { departmentName: "Executive Administration", description: "Executive Administration" },
];

export const generateNextDepartmentId = async () => {
  const depts = await Department.find({}, { departmentId: 1 });
  let maxNum = 0;
  for (const d of depts) {
    if (d.departmentId && d.departmentId.startsWith("DEP")) {
      const num = parseInt(d.departmentId.replace("DEP", ""), 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }
  return `DEP${String(maxNum + 1).padStart(3, "0")}`;
};

// Seed Default Departments
export const seedDefaultDepartments = async () => {
  try {
    for (const item of DEFAULT_DEPARTMENTS_SEED) {
      const exists = await Department.findOne({
        departmentName: { $regex: new RegExp(`^${item.departmentName}$`, "i") },
      });
      if (!exists) {
        const departmentId = await generateNextDepartmentId();
        await Department.create({
          departmentId,
          departmentName: item.departmentName,
          description: item.description,
          status: "Active",
        });
        console.log(`[Seed] Created default department: ${item.departmentName} (${departmentId})`);
      }
    }
  } catch (err) {
    console.error("[Seed] Error seeding default departments:", err.message);
  }
};

// Create Department
export const createDepartmentService = async (departmentData) => {

    // Check if departmentId or departmentName already exists
    const existingDepartment = await Department.findOne({
        $or: [
            { departmentId: departmentData.departmentId },
            { departmentName: departmentData.departmentName }
        ]
    });

    if (existingDepartment) {
        throw new Error("Department already exists");
    }

    return await Department.create(departmentData);
};

// Get All Departments
export const getAllDepartmentsService = async () => {
    await seedDefaultDepartments();
    return await Department.find().sort({ createdAt: 1 });
};

// Get Active Departments (public, minimal fields - used by Register page dropdown)
export const getPublicDepartmentsService = async () => {
    await seedDefaultDepartments();
    return await Department.find({ status: "Active" })
        .select("departmentId departmentName")
        .sort({ departmentName: 1 });
};

// Get Department By ID
export const getDepartmentByIdService = async (id) => {
    return await Department.findById(id);
};

// Update Department
export const updateDepartmentService = async (id, departmentData) => {
    return await Department.findByIdAndUpdate(
        id,
        departmentData,
        {
            returnDocument:"after",
            runValidators: true,
        }
    );
};

// Delete Department
export const deleteDepartmentService = async (id) => {
    return await Department.findByIdAndDelete(id);
};
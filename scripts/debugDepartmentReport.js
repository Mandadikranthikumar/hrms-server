import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

import UserModel from "../models/UserModel.js";
import Department from "../models/Department.js";
import Employee from "../models/Employee.js";
import Payroll from "../models/Payroll.js";

async function testDeptAggregation() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("=== AGGREGATION TEST START ===");

    const department = "Information Technology";
    const month = 8;
    const year = 2026;

    let deptObj = await Department.findOne({
      $or: [
        { departmentName: { $regex: new RegExp(`^${department}$`, "i") } },
        { departmentId: department },
        { _id: mongoose.Types.ObjectId.isValid(department) ? department : null },
      ],
    });

    const searchDeptName = deptObj ? deptObj.departmentName : department;

    const matchFilters = [];
    if (deptObj) {
      matchFilters.push({ "employee.department_id": deptObj._id });
    }
    matchFilters.push({ "department.departmentName": { $regex: new RegExp(`^${searchDeptName}$`, "i") } });
    matchFilters.push({ "employeeSnapshot.department": { $regex: new RegExp(`^${searchDeptName}$`, "i") } });

    const pipeline = [
      {
        $lookup: {
          from: "employee_details",
          localField: "employeeId",
          foreignField: "_id",
          as: "employee",
        },
      },
      { $unwind: { path: "$employee", preserveNullAndEmptyArrays: false } },
      {
        $lookup: {
          from: "departments",
          localField: "employee.department_id",
          foreignField: "_id",
          as: "department",
        },
      },
      { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          $or: matchFilters,
          ...(month ? { month: Number(month) } : {}),
          ...(year ? { year: Number(year) } : {}),
        },
      },
    ];

    const payrolls = await Payroll.aggregate(pipeline);
    console.log(`Aggregation SUCCESS: matched ${payrolls.length} payroll records for '${searchDeptName}':`);
    console.log(payrolls.map(p => ({
      _id: p._id,
      gross: p.grossSalary,
      net: p.netSalary,
      empCode: p.employeeSnapshot?.employeeCode || p.employee?.employee_code,
      dept: p.department?.departmentName
    })));

    console.log("=== AGGREGATION TEST END ===");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

testDeptAggregation();

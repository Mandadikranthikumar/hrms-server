import mongoose from "mongoose";

export const DEPARTMENT_ENUM = [
  "Human Resource",
  "HR",
  "Manager",
  "Employee",
  "Sales",
  "Executive Administration",
  "Finance",
  "Marketing",
  "Engineering",
  "Operations",
  "General",
];

const departmentSchema = new mongoose.Schema(
  {
    departmentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    departmentName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      enum: {
        values: DEPARTMENT_ENUM,
        message: "{VALUE} is not a supported department",
      },
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
  },
  {
    timestamps: true,
  }
);

const Department = mongoose.model("Department", departmentSchema);

export default Department;
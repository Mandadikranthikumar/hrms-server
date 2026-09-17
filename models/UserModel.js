import mongoose from "mongoose";

export const USER_DEPARTMENTS = [
  "Human Resource",
  "Human Resources",
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

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
    },


    role: {
      type: String,
      default: "Employee",
    },

    phone: {
      type: String,
      default: "",
    },

    department: {
      type: String,
      default: "Human Resource",
      trim: true,
      enum: {
        values: USER_DEPARTMENTS,
        message: "{VALUE} is not a valid department",
      },
    },

    googleId: {
      type: String,
      default: null,
    },

    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Employees", UserSchema);
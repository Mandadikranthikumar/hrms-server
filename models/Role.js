import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    roleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    roleName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    permissions: [
      {
        type: String,
      },
    ],

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

const Role = mongoose.model("Role", roleSchema);

export default Role;
import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
    },
    orgCode: {
      type: String,
      required: [true, "Organization code is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: function () {
        return this.orgCode;
      },
    },

    memberLimit: {
      type: Number,
      required: [true, "Member limit is required"],
      min: [1, "Member limit must be at least 1"],
      default: 50,
    },
    currentMemberCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employees",
      default: null,
    },
  },
  {
    timestamps: true,
    collection: "organizations",
  }
);

export default mongoose.model("Organization", organizationSchema);

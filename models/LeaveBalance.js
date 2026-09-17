import mongoose from "mongoose";

const leaveBalanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employees",
      required: true,
      unique: true,
    },
    annualTotal: {
      type: Number,
      default: 20,
    },
    annualUsed: {
      type: Number,
      default: 0,
    },
    annualRemaining: {
      type: Number,
      default: 20,
    },
    sickTotal: {
      type: Number,
      default: 10,
    },
    sickUsed: {
      type: Number,
      default: 0,
    },
    sickRemaining: {
      type: Number,
      default: 10,
    },
    casualTotal: {
      type: Number,
      default: 6,
    },
    casualUsed: {
      type: Number,
      default: 0,
    },
    casualRemaining: {
      type: Number,
      default: 6,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("LeaveBalance", leaveBalanceSchema);

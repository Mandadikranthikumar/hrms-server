import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: ["monthly", "yearly", "employee", "department"],
      required: true,
      index: true,
    },
    month: {
      type: Number,
      min: 1,
      max: 12,
      default: null,
    },
    year: {
      type: Number,
      min: 2000,
      default: null,
    },
    department: {
      type: String,
      default: null,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },
    summary: {
      totalEmployees: { type: Number, default: 0, min: 0 },
      totalGrossPay: { type: Number, default: 0, min: 0 },
      totalDeductions: { type: Number, default: 0, min: 0 },
      totalNetPay: { type: Number, default: 0, min: 0 },
    },
    filters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    fileUrl: {
      type: String,
      default: null,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

reportSchema.index({ reportType: 1, year: 1, month: 1 });

const Report = mongoose.model("Report", reportSchema);

export default Report;
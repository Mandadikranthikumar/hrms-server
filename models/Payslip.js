import mongoose from "mongoose";

const payslipSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
     employeeName: {
      type: String,
      required: true,
      trim: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
    },
    earnings: {
      basic: { type: Number, required: true, min: 0 },
      hra: { type: Number, default: 0, min: 0 },
      allowances: { type: Number, default: 0, min: 0 },
      bonus: { type: Number, default: 0, min: 0 },
    },
    deductions: {
      tax: { type: Number, default: 0, min: 0 },
      providentFund: { type: Number, default: 0, min: 0 },
      insurance: { type: Number, default: 0, min: 0 },
      other: { type: Number, default: 0, min: 0 },
    },
    grossPay: {
      type: Number,
      required: true,
      min: 0,
    },
    totalDeductions: {
      type: Number,
      required: true,
      min: 0,
    },
    netPay: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ["generated", "sent", "downloaded"],
      default: "generated",
    },
    pdfUrl: {
      type: String,
      default: null,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

payslipSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

const Payslip = mongoose.model("Payslip", payslipSchema);

export default Payslip;
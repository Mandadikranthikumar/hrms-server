// server/models/Payroll.js

import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
    },
    salaryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Salary',
      default: null,
    },
    accountNumber: { type: String, default: '' },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 },
    daysPresent: { type: Number, required: true, min: 0 },
    totalWorkingDays: { type: Number, required: true, min: 1 },
    basicSalary: { type: Number, required: true, min: 0 },
    hra: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    bonus: { type: Number, default: 0, min: 0 },
    grossSalary: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    status: { type: String, enum: ['Generated', 'Paid'], default: 'Generated' },
    // TEMP: required removed until Team 1 delivers authMiddleware.js
    // and req.user is actually populated. Add back required: true after.
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    paymentDate: { type: Date, default: null },
    employeeSnapshot: {
      employeeCode: { type: String, default: '' },
      fullName: { type: String, default: '' },
      department: { type: String, default: '' },
      designation: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

payrollSchema.index({ employeeId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model('Payroll', payrollSchema);
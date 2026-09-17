// server/models/Salary.js

import mongoose from 'mongoose';

const salarySchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: [true, 'Employee ID is required'],
    },
    basicSalary: {
      type: Number,
      required: [true, 'Basic salary is required'],
      min: [0, 'Basic salary cannot be negative'],
    },
    hra: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    bonus: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    grossSalary: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    effectiveFrom: {
      type: Date,
      required: [true, 'Effective date is required'],
      default: Date.now,
    },
    isActive: { type: Boolean, default: true },
    // TEMP: required removed until Team 1 delivers authMiddleware.js
    // and req.user is actually populated. Add back required: true after.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

salarySchema.pre('save', function () {
  this.grossSalary = this.basicSalary + this.hra + this.allowances + this.bonus;
  this.netSalary = this.grossSalary - this.deductions;
});

export default mongoose.model('Salary', salarySchema);
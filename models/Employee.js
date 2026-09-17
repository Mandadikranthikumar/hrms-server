import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    // ==========================================
    // USER REFERENCE
    // Links Employee with Team 1 User Account
    // ==========================================
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employees",
      required: true,
      unique: true,
    },

    // ==========================================
    // EMPLOYEE CODE
    // Example: EMP001, EMP002
    // ==========================================
    employee_code: {
      type: String,
      unique: true,
      trim: true,
    },

    // ==========================================
    // DEPARTMENT REFERENCE
    // Links Employee with Department
    // ==========================================
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },

    // ==========================================
    // EMPLOYEE DESIGNATION
    // Example: Software Developer
    // ==========================================
    designation: {
      type: String,
      required: true,
      trim: true,
    },

    // ==========================================
    // MANAGER REFERENCE
    // Links Employee with another Employee
    // ==========================================
    manager_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },

    // ==========================================
    // DATE OF JOINING
    // ==========================================
    date_of_joining: {
      type: Date,
      required: true,
    },

    // ==========================================
    // EMPLOYMENT STATUS
    // ==========================================
    employment_status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },

    // ==========================================
    // ORGANIZATION REFERENCE
    // Links Employee with Organization
    // ==========================================
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },

    // ==========================================
    // PAYROLL & BONUS FIELDS
    // ==========================================
    month_salary: {
      type: Number,
      default: 50000,
      min: 0,
    },

    account_number: {
      type: String,
      default: "XXXX6787",
      trim: true,
    },

    ifsc_code: {
      type: String,
      default: "HDFC0001234",
      trim: true,
    },

    bank_name: {
      type: String,
      default: "HDFC Bank",
      trim: true,
    },

    branch: {
      type: String,
      default: "Main Branch",
      trim: true,
    },

    upi_id: {
      type: String,
      default: "",
      trim: true,
    },

    last_payment_date: {
      type: Date,
      default: null,
    },

    last_bonus_date: {
      type: Date,
      default: null,
    },

    bonus_history: [
      {
        amount: { type: Number, required: true },
        paidAt: { type: Date, default: Date.now },
        transactionRef: { type: String, default: "" },
        note: { type: String, default: "" },
      },
    ],
  },
  {
    timestamps: true,
    collection: "employee_details",
  }
);

// ==========================================
// EMPLOYEE MODEL
// ==========================================
const Employee = mongoose.model("Employee", employeeSchema);

export default Employee;
import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
      trim: true,
    },

    date: {
      type: Date,
      required: true,
    },

    checkIn: {
      type: Date,
      default: null,
    },

    checkOut: {
      type: Date,
      default: null,
    },

    workingHours: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "Present",
        "Late",
        "Half Day",
        "Early Checkout"
      ],
      default: "Present",
    },

    location: {
      type: String,
      trim: true,
      default: "",
    },

    remarks: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);


attendanceSchema.index(
  { employeeId: 1, date: 1 },
  { unique: true }
);


const Attendance = mongoose.model(
  "Attendance",
  attendanceSchema
);


export default Attendance;
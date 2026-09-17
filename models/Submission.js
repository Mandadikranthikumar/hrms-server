import mongoose from "mongoose";

const submissionSchema = new mongoose.Schema(
  {
    taskAssignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TaskAssignment",
      required: true,
    },
    candidate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Candidate",
      required: true,
    },
    submissionText: {
      type: String,
      required: [true, "Please provide submission details or description"],
      trim: true,
    },
    attachmentUrl: {
      type: String,
      trim: true,
      default: "",
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    version: {
      type: Number,
      required: true,
      default: 1,
    },
    status: {
      type: String,
      enum: ["SUBMITTED", "APPROVED", "REWORK_REQUIRED"],
      default: "SUBMITTED",
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

submissionSchema.index({ taskAssignment: 1, version: -1 });

export default mongoose.model("Submission", submissionSchema);
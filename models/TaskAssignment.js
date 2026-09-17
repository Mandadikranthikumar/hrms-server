import mongoose from "mongoose";

const taskAssignmentSchema = new mongoose.Schema(
    {
        task: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Task",
            required: true,
        },
        candidate: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Candidate",
            required: true,
        },
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employees",
            required: true,
        },
        assignedAt: {
            type: Date,
            default: Date.now,
        },
        deadline: {
            type: Date,
            required: [true, "Please provide a task deadline"],
        },
        status: {
            type: String,
            enum: ["PENDING", "IN_PROGRESS", "SUBMITTED", "COMPLETED", "REWORK_REQUIRED"],
            default: "PENDING",
        },
        progressPercentage: {
            type: Number,
            min: 0,
            max: 100,
            default: 0,
        },
        assignmentVersion: {
            type: Number,
            default: 1,
        },
        completedAt: {
            type: Date,
            default: null,
        },
        notes: {
            type: String,
            trim: true,
            default: "",
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

taskAssignmentSchema.index({ candidate: 1, status: 1 });
taskAssignmentSchema.index({ task: 1 });
taskAssignmentSchema.index({ organizationId: 1 });

export default mongoose.model("TaskAssignment", taskAssignmentSchema);
import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, "Please provide a task title"],
            trim: true,
        },
        description: {
            type: String,
            required: [true, "Please provide a task description"],
            trim: true,
        },
        priority: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            default: "MEDIUM",
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Employees",
            required: true,
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

export default mongoose.model("Task", taskSchema);
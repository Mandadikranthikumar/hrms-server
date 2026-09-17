import mongoose from "mongoose";

export const CANDIDATE_DEPARTMENTS = [
    "Human Resource",
    "HR",
    "Manager",
    "Employee",
    "Sales",
    "Executive Administration",
    "Frontend Engineering",
    "Backend Engineering",
    "DevOps & Cloud",
    "Quality Assurance",
    "Finance",
    "Marketing",
    "General",
];

const candidateSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Please provide candidate name"],
            trim: true,
        },
        email: {
            type: String,
            required: [true, "Please provide candidate email"],
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
            default: "",
        },
        department: {
            type: String,
            required: [true, "Please specify a department"],
            enum: {
                values: CANDIDATE_DEPARTMENTS,
                message: "{VALUE} is not a valid department",
            },
            trim: true,
        },
        designation: {
            type: String,
            required: [true, "Please specify a designation"],
            trim: true,
        },
        team: {
            type: String,
            required: [true, "Please specify a team"],
            trim: true,
        },
        joiningDate: {
            type: Date,
            default: Date.now,
        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
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

candidateSchema.index({ email: 1, organizationId: 1 });

export default mongoose.model("Candidate", candidateSchema);
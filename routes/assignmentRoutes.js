import express from "express";
import {
    getAssignments,
    getAssignmentById,
    createAssignment,
    updateAssignment,
    reassignAssignment,
} from "../controllers/assignmentController.js";
import { verifyToken, authorizeRoles } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getAssignments);
router.get("/:id", getAssignmentById);
router.post("/", authorizeRoles("Admin", "HR", "HR Manager"), createAssignment);
router.put("/:id", authorizeRoles("Admin", "HR", "HR Manager"), updateAssignment);
router.put("/:id/reassign", authorizeRoles("Admin", "HR", "HR Manager"), reassignAssignment);

export default router;
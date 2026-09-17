import express from "express";
import {
    getTasks,
    getTaskById,
    createTask,
    updateTask,
    deleteTask,
} from "../controllers/taskController.js";
import { verifyToken, authorizeRoles } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getTasks);
router.get("/:id", getTaskById);
router.post("/", authorizeRoles("Admin", "HR", "HR Manager"), createTask);
router.put("/:id", authorizeRoles("Admin", "HR", "HR Manager"), updateTask);
router.delete("/:id", authorizeRoles("Admin", "HR", "HR Manager"), deleteTask);

export default router;
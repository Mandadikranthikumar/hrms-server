import express from "express";
import {
  getSubmissions,
  getSubmissionById,
  createSubmission,
} from "../controllers/submissionController.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/", getSubmissions);
router.get("/:id", getSubmissionById);
router.post("/", createSubmission);

export default router;
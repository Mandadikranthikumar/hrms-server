import express from "express";
import {
  getReviewQueue,
  getReviewById,
  approveSubmission,
  reworkSubmission,
  getAssignmentReviews,
} from "../controllers/reviewController.js";
import { verifyToken, authorizeRoles } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(verifyToken);

router.get("/pending", authorizeRoles("Admin", "HR", "HR Manager"), getReviewQueue);
router.get("/assignment/:assignmentId", getAssignmentReviews);
router.get("/:id", getReviewById);
router.post("/:submissionId/approve", authorizeRoles("Admin", "HR", "HR Manager"), approveSubmission);
router.post("/:submissionId/rework", authorizeRoles("Admin", "HR", "HR Manager"), reworkSubmission);

export default router;
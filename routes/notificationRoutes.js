import express from "express";
import {
  getNotifications,
  markAsRead,
  markAllRead,
} from "../controllers/notificationController.js";
import { verifyToken } from "../middlewares/authMiddleware.js";

const router = express.Router();

// GET /api/notifications — get logged-in user's notifications
router.get("/", verifyToken, getNotifications);

// PUT /api/notifications/read-all — mark all as read
router.put("/read-all", verifyToken, markAllRead);

// PUT /api/notifications/:id/read — mark single as read
router.put("/:id/read", verifyToken, markAsRead);

export default router;

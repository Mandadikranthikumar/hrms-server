import Notification from "../models/Notification.js";

// Get all notifications for the logged-in user (newest first)
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const notifications = await Notification.find({ recipient: userId })
      .populate({
        path: "relatedLeave",
        populate: { path: "employee", select: "name email role" },
      })
      .populate("relatedTask", "title priority")
      .populate({
        path: "relatedAssignment",
        populate: { path: "task", select: "title priority" },
      })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter((n) => !n.read).length;

    return res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Mark a single notification as read
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: userId },
      { read: true },
      { new: true }
    );

    if (!notif) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({ success: true, notification: notif });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Mark all notifications as read for the logged-in user
export const markAllRead = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    await Notification.updateMany({ recipient: userId, read: false }, { read: true });
    return res.status(200).json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

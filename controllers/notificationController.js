import Notification from "../models/Notification.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .populate("project", "name")
      .populate("task", "title")
      .populate("actor", "name role team")
      .sort({ createdAt: -1 });
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch notifications." });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: "Notification not found." });
    if (notification.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized." });
    }
    notification.isRead = true;
    await notification.save();
    return res.json(notification);
  } catch (error) {
    return res.status(400).json({ message: "Unable to update notification." });
  }
};

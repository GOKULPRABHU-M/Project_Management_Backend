import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { createNotification } from "../utils/notificationHelper.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .populate("project", "name")
      .populate("task", "title")
      .populate("actor", "name role team")
      .populate("leader", "name role team")
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

export const createWarningNotification = async (req, res) => {
  try {
    const { recipientId, message, type, reason } = req.body;
    if (!recipientId || !message) {
      return res.status(400).json({ message: "Recipient and message are required." });
    }
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: "Recipient not found." });
    }
    if (recipient.role !== "team_leader" && recipient.role !== "member") {
      return res.status(400).json({ message: "Warnings can only be sent to team leaders or members." });
    }
    let leaderId = recipient.role === "team_leader" ? recipient._id : null;
    if (recipient.role === "member") {
      const leader = await User.findOne({ role: "team_leader", team: recipient.team });
      leaderId = leader?._id || null;
    }
    const notification = await createNotification({
      userId: recipientId,
      message,
      type: type || "warning",
      reason,
      actorId: req.user._id,
      leaderId,
    });
    if (!notification) {
      return res.status(400).json({ message: "Unable to create notification." });
    }
    const populated = await Notification.findById(notification._id)
      .populate("project", "name")
      .populate("task", "title")
      .populate("actor", "name role team")
      .populate("leader", "name role team");
    return res.status(201).json(populated);
  } catch (error) {
    return res.status(400).json({ message: "Unable to create notification." });
  }
};

export const getLeaderWarningHistory = async (req, res) => {
  try {
    const leader = await User.findById(req.params.leaderId);
    if (!leader || leader.role !== "team_leader") {
      return res.status(404).json({ message: "Team leader not found." });
    }
    const warnings = await Notification.find({
      type: "warning",
      leader: leader._id,
    })
      .populate("actor", "name role team")
      .populate("user", "name role team")
      .sort({ createdAt: -1 });
    return res.json(warnings);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch warning history." });
  }
};

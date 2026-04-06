import Notification from "../models/Notification.js";

export const createNotification = async ({
  userId,
  message,
  type = "general",
  reason,
  projectId,
  taskId,
  actorId,
  leaderId,
}) => {
  if (!userId || !message) return null;
  const notification = await Notification.create({
    user: userId,
    message,
    type,
    reason: reason || undefined,
    project: projectId || undefined,
    task: taskId || undefined,
    actor: actorId || undefined,
    leader: leaderId || undefined,
  });
  return notification;
};

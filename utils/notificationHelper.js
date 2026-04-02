import Notification from "../models/Notification.js";

export const createNotification = async ({
  userId,
  message,
  type = "general",
  projectId,
  taskId,
  actorId,
}) => {
  if (!userId || !message) return null;
  const notification = await Notification.create({
    user: userId,
    message,
    type,
    project: projectId || undefined,
    task: taskId || undefined,
    actor: actorId || undefined,
  });
  return notification;
};

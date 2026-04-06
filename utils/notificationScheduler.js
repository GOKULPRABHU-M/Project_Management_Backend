import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { createNotification } from "./notificationHelper.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const findTeamLeaderByTeam = async (teamName) => {
  if (!teamName) return null;
  const team = await Team.findOne({ name: teamName }).select("leader");
  if (team?.leader) return await User.findById(team.leader);
  return await User.findOne({ role: "team_leader", team: teamName });
};

const isDueTomorrow = (date) => {
  if (!date) return false;
  const due = new Date(date);
  if (Number.isNaN(due.getTime())) return false;
  const diff = due.getTime() - Date.now();
  return diff > 0 && diff <= ONE_DAY_MS;
};

const notifyProjectDueSoon = async () => {
  const candidates = await Project.find({
    endDate: { $ne: null },
    status: { $ne: "completed" },
    $or: [{ dueSoonNotifiedAt: null }, { dueSoonNotifiedAt: { $exists: false } }],
  }).select("name endDate team leader");

  for (const project of candidates) {
    if (!isDueTomorrow(project.endDate)) continue;
    let leader = null;
    if (project.leader) {
      leader = await User.findById(project.leader);
    }
    if (!leader) {
      leader = await findTeamLeaderByTeam(project.team);
    }
    if (leader) {
      await createNotification({
        userId: leader._id,
        type: "project_due_soon",
        message: `Project due tomorrow: ${project.name}`,
        projectId: project._id,
      });
    }

    const admins = await User.find({ role: "admin" }).select("_id");
    await Promise.all(
      admins.map((admin) =>
        createNotification({
          userId: admin._id,
          type: "project_due_soon",
          message: `Project due tomorrow: ${project.name}`,
          projectId: project._id,
        })
      )
    );

    if (!leader && !admins.length) continue;
    project.dueSoonNotifiedAt = new Date();
    await project.save();
  }
};

const notifyTaskDueSoon = async () => {
  const candidates = await Task.find({
    dueDate: { $ne: null },
    status: { $ne: "completed" },
    $or: [{ dueSoonNotifiedAt: null }, { dueSoonNotifiedAt: { $exists: false } }],
  }).select("title dueDate assignedTo project");

  for (const task of candidates) {
    if (!isDueTomorrow(task.dueDate)) continue;
    if (!task.assignedTo) continue;

    const assignee = await User.findById(task.assignedTo).select("role");
    if (!assignee || assignee.role !== "member") continue;

    await createNotification({
      userId: task.assignedTo,
      type: "task_due_soon",
      message: `Task due tomorrow: ${task.title}`,
      taskId: task._id,
      projectId: task.project,
    });
    task.dueSoonNotifiedAt = new Date();
    await task.save();
  }
};

const notifyOverdueTasks = async () => {
  const now = new Date();
  const overdueTasks = await Task.find({
    dueDate: { $ne: null, $lt: now },
    status: { $ne: "completed" },
    $or: [{ overdueNotifiedAt: null }, { overdueNotifiedAt: { $exists: false } }],
  }).select("title dueDate assignedTo project");

  for (const task of overdueTasks) {
    if (!task.assignedTo) continue;
    await createNotification({
      userId: task.assignedTo,
      type: "task_overdue",
      message: `Task overdue: ${task.title}`,
      taskId: task._id,
      projectId: task.project,
    });
    task.overdueNotifiedAt = new Date();
    await task.save();
  }
};

export const runNotificationChecks = async () => {
  await notifyProjectDueSoon();
  await notifyTaskDueSoon();
  await notifyOverdueTasks();
};

export const startNotificationScheduler = () => {
  const intervalMs = 60 * 60 * 1000;
  setInterval(() => {
    runNotificationChecks().catch((error) => {
      console.error("Notification scheduler error:", error.message);
    });
  }, intervalMs);
};

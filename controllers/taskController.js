import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import { createNotification } from "../utils/notificationHelper.js";

const isMember = (project, userId) =>
  project.members.some((memberId) => memberId.toString() === userId.toString());

const canManageTasks = (role) => role === "admin" || role === "team_leader";
const normalizeStatus = (status) =>
  typeof status === "string" ? status.trim().toLowerCase() : status;
const isCompletedStatus = (status) => ["completed", "done"].includes(normalizeStatus(status));

const validateAssignment = async (req, project, assignedToId, assignedTeam) => {
  if (!assignedToId) return null;

  const assignee = await User.findById(assignedToId);
  if (!assignee) return "Assigned member not found.";

  if (req.user.role === "admin") {
    if (assignee.role !== "team_leader") {
      return "Admin must assign tasks to team leaders.";
    }
    if (assignedTeam && assignedTeam !== assignee.team) {
      return "Assigned team must match team leader team.";
    }
    return null;
  }

  if (req.user.role === "team_leader") {
    if (assignee.role !== "member") return "Team leader can assign tasks only to members.";
    if (req.user.team !== assignee.team) {
      return "Team leader can assign tasks only to members in their own team.";
    }
    if (assignedTeam && assignedTeam !== req.user.team) {
      return "Team leader cannot assign tasks to another team.";
    }
    if (project.team !== req.user.team) {
      return "Team leader can assign tasks only in their own team projects.";
    }
  }

  return null;
};

const findTeamLeaderByTeam = async (teamName) => {
  if (!teamName) return null;
  return await User.findOne({ role: "team_leader", team: teamName });
};

const notifyTeamLeaderAssignedByAdmin = async ({
  assignedToId,
  teamName,
  taskId,
  projectId,
  title,
  actorId,
}) => {
  let leader = null;
  if (assignedToId) {
    const assignee = await User.findById(assignedToId);
    if (assignee?.role === "team_leader") leader = assignee;
  }
  if (!leader) {
    leader = await findTeamLeaderByTeam(teamName);
  }
  if (!leader) return;

  await createNotification({
    userId: leader._id,
    type: "task_assigned",
    message: `Admin assigned you a task: ${title}`,
    taskId,
    projectId,
    actorId,
  });
};

// GET all tasks in a project
export const getTasks = async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    const tasks = await Task.find({ project: req.params.projectId })
      .populate("assignedTo", "name email role team")
      .sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CREATE task
export const createTask = async (req, res) => {
  const { title, priority, status, dueDate, assignedTo, assignedTeam } = req.body;
  try {
    if (!canManageTasks(req.user.role)) {
      return res.status(403).json({ message: "Only admin or team leader can assign tasks." });
    }

    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    const assignmentError = await validateAssignment(req, project, assignedTo, assignedTeam);
    if (assignmentError) return res.status(400).json({ message: assignmentError });

    const createdTask = await Task.create({
      title,
      project: req.params.projectId,
      priority: priority || "medium",
      status: status || "pending",
      dueDate,
      assignedTo: assignedTo || null,
      assignedTeam: assignedTeam || project.team || "General",
    });

    if (req.user.role === "admin") {
      await notifyTeamLeaderAssignedByAdmin({
        assignedToId: assignedTo || null,
        teamName: createdTask.assignedTeam,
        taskId: createdTask._id,
        projectId: req.params.projectId,
        title: title || "Untitled Task",
        actorId: req.user._id,
      });
      console.log(
        "[notifications] admin_assigned_task",
        `admin=${req.user._id}`,
        `task=${createdTask._id}`,
        `project=${req.params.projectId}`,
        `team=${createdTask.assignedTeam || "General"}`
      );
    }

    if (req.user.role === "team_leader" && assignedTo) {
      console.log(
        "[notifications] leader_assigned_task",
        `leader=${req.user._id}`,
        `member=${assignedTo}`,
        `task=${createdTask._id}`,
        `project=${req.params.projectId}`
      );
      await createNotification({
        userId: assignedTo,
        type: "task_assigned",
        message: `Lead assigned you a task: ${title || "Untitled Task"}`,
        taskId: createdTask._id,
        projectId: req.params.projectId,
        actorId: req.user._id,
      });
    }

    const task = await Task.findById(createdTask._id).populate("assignedTo", "name email role team");
    res.status(201).json(task);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// UPDATE task
export const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const previousStatus = task.status;
    const previousAssignedTeam = task.assignedTeam;

    const project = await Project.findById(task.project);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    if (!canManageTasks(req.user.role)) {
      if (task.assignedTo?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "Members can update only their own tasks." });
      }
      if (req.body.status) task.status = req.body.status;
    } else {
      const nextAssignedTo = req.body.assignedTo || task.assignedTo;
      const nextAssignedTeam = req.body.assignedTeam || task.assignedTeam;
      if (req.body.assignedTo || req.body.assignedTeam) {
        const assignmentError = await validateAssignment(req, project, nextAssignedTo, nextAssignedTeam);
        if (assignmentError) return res.status(400).json({ message: assignmentError });
      }

      task.title = req.body.title || task.title;
      task.priority = req.body.priority || task.priority;
      task.status = req.body.status || task.status;
      task.dueDate = req.body.dueDate || task.dueDate;
      task.assignedTo = nextAssignedTo;
      task.assignedTeam = nextAssignedTeam;
    }

    await task.save();

    if (req.user.role === "admin" && (req.body.assignedTo || req.body.assignedTeam)) {
      await notifyTeamLeaderAssignedByAdmin({
        assignedToId: req.body.assignedTo || null,
        teamName: task.assignedTeam || previousAssignedTeam || project.team,
        taskId: task._id,
        projectId: task.project,
        title: task.title,
        actorId: req.user._id,
      });
      console.log(
        "[notifications] admin_reassigned_task",
        `admin=${req.user._id}`,
        `task=${task._id}`,
        `project=${task.project}`,
        `team=${task.assignedTeam || previousAssignedTeam || project.team || "General"}`
      );
    }

    if (req.user.role === "team_leader" && req.body.assignedTo) {
      console.log(
        "[notifications] leader_reassigned_task",
        `leader=${req.user._id}`,
        `member=${req.body.assignedTo}`,
        `task=${task._id}`,
        `project=${task.project}`
      );
      await createNotification({
        userId: req.body.assignedTo,
        type: "task_assigned",
        message: `Lead assigned you a task: ${task.title}`,
        taskId: task._id,
        projectId: task.project,
        actorId: req.user._id,
      });
    }

    if (req.user.role === "member" && isCompletedStatus(task.status) && !isCompletedStatus(previousStatus)) {
      const teamName = task.assignedTeam || project.team;
      const leader = await findTeamLeaderByTeam(teamName);
      if (leader) {
        console.log(
          "[notifications] member_completed_task",
          `member=${req.user._id}`,
          `leader=${leader._id}`,
          `task=${task._id}`,
          `project=${task.project}`
        );
        await createNotification({
          userId: leader._id,
          type: "task_completed",
          message: `${req.user.name} completed task: ${task.title}`,
          taskId: task._id,
          projectId: task.project,
          actorId: req.user._id,
        });
      }
    }

    const updated = await Task.findById(task._id).populate("assignedTo", "name email role team");
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE task
export const deleteTask = async (req, res) => {
  try {
    if (!canManageTasks(req.user.role)) {
      return res.status(403).json({ message: "Only admin or team leader can delete tasks." });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const project = await Project.findById(task.project);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    await task.deleteOne();
    res.json({ message: "Task deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

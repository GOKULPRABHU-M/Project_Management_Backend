import Task from "../models/Task.js";
import Project from "../models/Project.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const isMember = (project, userId) =>
  project.members.some((memberId) => memberId.toString() === userId.toString());

const canManageTasks = (role) => role === "admin" || role === "team_leader";

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

const notifyTeamLeader = async ({ assignedToId, taskId, projectId, title }) => {
  const assignee = await User.findById(assignedToId);
  if (!assignee || assignee.role !== "team_leader") return;
  await Notification.create({
    recipient: assignee._id,
    type: "task_assigned",
    message: `New task assigned to you: ${title}`,
    task: taskId,
    project: projectId,
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

    await notifyTeamLeader({
      assignedToId: assignedTo || null,
      taskId: createdTask._id,
      projectId: req.params.projectId,
      title: title || "Untitled Task",
    });

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
    if (req.user.role === "admin" && req.body.assignedTo) {
      await Notification.create({
        recipient: req.body.assignedTo,
        type: "task_reassigned",
        message: `Task assigned to you: ${task.title}`,
        task: task._id,
        project: task.project,
      });
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

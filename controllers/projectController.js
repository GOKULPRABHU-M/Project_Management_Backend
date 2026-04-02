import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import User from "../models/User.js";
import { createNotification } from "../utils/notificationHelper.js";

const isMember = (project, userId) =>
  project.members.some((memberId) => memberId.toString() === userId.toString());
const normalizeStatus = (status) =>
  typeof status === "string" ? status.trim().toLowerCase() : status;
const isCompletedStatus = (status) => ["completed", "done"].includes(normalizeStatus(status));
const findTeamLeaderByTeam = async (teamName) => {
  if (!teamName) return null;
  const team = await Team.findOne({ name: teamName }).select("leader");
  if (team?.leader) return await User.findById(team.leader);
  return await User.findOne({ role: "team_leader", team: teamName });
};

// GET all projects
export const getProjects = async (req, res) => {
  try {
    const query =
      req.user.role === "admin"
        ? {}
        : {
            $or: [{ members: req.user._id }, { team: req.user.team }],
          };
    const projects = await Project.find(query).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// CREATE project
export const createProject = async (req, res) => {
  const { name, description, team, startDate, endDate, status, specifications } = req.body;
  try {
    let members = [req.user._id];
    const projectTeam = team || req.user.team || "General";
    const existingTeam = await Team.findOne({ name: projectTeam });

    if (existingTeam) {
      const teamUsers = await User.find({
        _id: { $in: [existingTeam.leader, ...existingTeam.members] },
      }).select("_id");
      members = [...new Set([req.user._id.toString(), ...teamUsers.map((u) => u._id.toString())])];
    }

    const project = await Project.create({
      name,
      description,
      team: projectTeam,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      status: status || "active",
      specifications: Array.isArray(specifications) ? specifications : [],
      members,
      createdBy: req.user._id,
    });

    if (req.user.role === "admin") {
      const leader = await findTeamLeaderByTeam(projectTeam);
      if (leader) {
        await createNotification({
          userId: leader._id,
          type: "project_assigned",
          message: `Admin assigned you a project: ${project.name}`,
          projectId: project._id,
          actorId: req.user._id,
        });
      }
    }
    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// UPDATE project
export const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const previousStatus = project.status;
    const previousTeam = project.team;

    // Only allow members to update
    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    project.name = req.body.name || project.name;
    project.description = req.body.description ?? project.description;
    project.team = req.body.team || project.team;
    project.startDate = req.body.startDate || project.startDate;
    project.endDate = req.body.endDate || project.endDate;
    project.status = req.body.status || project.status;
    project.specifications = Array.isArray(req.body.specifications)
      ? req.body.specifications
      : project.specifications;
    await project.save();

    if (req.user.role === "admin" && project.team !== previousTeam) {
      const leader = await findTeamLeaderByTeam(project.team);
      if (leader) {
        await createNotification({
          userId: leader._id,
          type: "project_assigned",
          message: `Admin assigned you a project: ${project.name}`,
          projectId: project._id,
          actorId: req.user._id,
        });
      }
    }

    if (
      req.user.role === "team_leader" &&
      isCompletedStatus(project.status) &&
      !isCompletedStatus(previousStatus)
    ) {
      const admins = await User.find({ role: "admin" }).select("_id");
      console.log(
        "[notifications] lead_completed_project",
        `leader=${req.user._id}`,
        `project=${project._id}`,
        `admins=${admins.map((admin) => admin._id).join(",") || "none"}`
      );
      await Promise.all(
        admins.map((admin) =>
          createNotification({
            userId: admin._id,
            type: "project_completed",
            message: `Lead completed project: ${project.name}`,
            projectId: project._id,
            actorId: req.user._id,
          })
        )
      );
    }

    res.json(project);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// DELETE project
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    await project.deleteOne();
    res.json({ message: "Project deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getProjectGrowth = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  try {
    const projects = await Project.find({}).sort({ createdAt: -1 });
    const growth = await Promise.all(
      projects.map(async (project) => {
        const tasks = await Task.find({ project: project._id }).select("status");
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter((task) => task.status === "completed").length;
        const completionPercent = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
        return {
          projectId: project._id,
          projectName: project.name,
          team: project.team,
          totalTasks,
          completedTasks,
          completionPercent,
          status: project.status,
        };
      })
    );
    return res.json(growth);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch project growth." });
  }
};

import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Team from "../models/Team.js";
import User from "../models/User.js";

const isMember = (project, userId) =>
  project.members.some((memberId) => memberId.toString() === userId.toString());

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

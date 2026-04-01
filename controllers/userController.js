import User from "../models/User.js";
import Project from "../models/Project.js";

export const getUsers = async (req, res) => {
  try {
    const users = await User.find({}, "name email role team experienceYears").sort({ name: 1 });
    const completedProjects = await Project.find({ status: "completed" }).select("members");
    const projectCountByUser = completedProjects.reduce((acc, project) => {
      project.members.forEach((memberId) => {
        const key = memberId.toString();
        acc[key] = (acc[key] || 0) + 1;
      });
      return acc;
    }, {});

    const rows = users.map((user) => ({
      ...user.toObject(),
      completedProjectCount: projectCountByUser[user._id.toString()] || 0,
    }));
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch users." });
  }
};

export const createEmployee = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  try {
    const { name, email, password, role, team, experienceYears } = req.body;
    const allowedRoles = ["team_leader", "member"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Employee role must be team_leader or member." });
    }
    const existing = await User.findOne({ email: email?.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ message: "Email already registered." });
    }

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      role,
      team: team || "General",
      experienceYears: Number(experienceYears) || 0,
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      experienceYears: user.experienceYears,
      completedProjectCount: 0,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to create employee." });
  }
};

export const updateEmployee = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "Employee not found." });
    if (user.role === "admin") return res.status(400).json({ message: "Admin account cannot be updated here." });

    const { name, email, password, role, team, experienceYears } = req.body;
    const allowedRoles = ["team_leader", "member"];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Employee role must be team_leader or member." });
    }

    if (email && email.toLowerCase().trim() !== user.email) {
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing && existing._id.toString() !== user._id.toString()) {
        return res.status(400).json({ message: "Email already registered." });
      }
      user.email = email.toLowerCase().trim();
    }

    if (name) user.name = name;
    if (role) user.role = role;
    if (team) user.team = team;
    if (typeof experienceYears !== "undefined") user.experienceYears = Number(experienceYears) || 0;
    if (password) user.password = password;

    await user.save();

    const completedProjectCount = await Project.countDocuments({
      status: "completed",
      members: user._id,
    });

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      experienceYears: user.experienceYears,
      completedProjectCount,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to update employee." });
  }
};

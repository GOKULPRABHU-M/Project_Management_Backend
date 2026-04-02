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
const resolveLeaderForProject = async (leaderId, teamName) => {
  if (!leaderId) return null;
  const leader = await User.findById(leaderId);
  if (!leader) {
    return { error: "Selected leader not found." };
  }
  if (leader.role !== "team_leader") {
    return { error: "Selected user is not a team leader." };
  }
  if (teamName && leader.team !== teamName) {
    return { error: "Leader must belong to the selected team." };
  }
  return { leader };
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
  const {
    name,
    description,
    team,
    startDate,
    endDate,
    status,
    specifications,
    category,
    priority,
    template,
    icon,
    themeColor,
    leader: leaderId,
  } = req.body;
  try {
    let members = [req.user._id];
    const projectTeam = team || req.user.team || "General";
    const existingTeam = await Team.findOne({ name: projectTeam });
    let leader = null;

    if (existingTeam) {
      const teamUsers = await User.find({
        _id: { $in: [existingTeam.leader, ...existingTeam.members] },
      }).select("_id");
      members = [...new Set([req.user._id.toString(), ...teamUsers.map((u) => u._id.toString())])];
    }

    if (req.user.role === "admin" && leaderId) {
      const resolved = await resolveLeaderForProject(leaderId, projectTeam);
      if (resolved?.error) return res.status(400).json({ message: resolved.error });
      leader = resolved.leader;
    } else {
      leader = await findTeamLeaderByTeam(projectTeam);
    }

    const project = await Project.create({
      name,
      description,
      team: projectTeam,
      startDate: startDate || new Date(),
      endDate: endDate || null,
      status: status || "active",
      category: category || "",
      priority: priority || "medium",
      template: template || "",
      icon: icon || "",
      themeColor: themeColor || "",
      specifications: Array.isArray(specifications) ? specifications : [],
      members,
      createdBy: req.user._id,
      leader: leader?._id || null,
    });

    if (req.user.role === "admin") {
      if (leader) {
        await createNotification({
          userId: leader._id,
          type: "project_assigned",
          message: leaderId
            ? `Admin assigned you as project leader: ${project.name}`
            : `Admin assigned you a project: ${project.name}`,
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
    const previousLeader = project.leader?.toString() || null;

    // Only allow members to update
    if (req.user.role !== "admin" && !isMember(project, req.user._id))
      return res.status(403).json({ message: "Not authorized" });

    project.name = req.body.name || project.name;
    project.description = req.body.description ?? project.description;
    project.team = req.body.team || project.team;
    project.startDate = req.body.startDate || project.startDate;
    if (typeof req.body.endDate !== "undefined") {
      project.endDate = req.body.endDate ? req.body.endDate : null;
      project.dueSoonNotifiedAt = null;
    }
    project.status = req.body.status || project.status;
    if (typeof req.body.category !== "undefined") project.category = req.body.category;
    if (typeof req.body.priority !== "undefined") project.priority = req.body.priority;
    if (typeof req.body.template !== "undefined") project.template = req.body.template;
    if (typeof req.body.icon !== "undefined") project.icon = req.body.icon;
    if (typeof req.body.themeColor !== "undefined") project.themeColor = req.body.themeColor;
    project.specifications = Array.isArray(req.body.specifications)
      ? req.body.specifications
      : project.specifications;

    if (typeof req.body.leader !== "undefined") {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Only admin can change project leader." });
      }
      if (!req.body.leader) {
        project.leader = null;
      } else {
        const resolved = await resolveLeaderForProject(req.body.leader, project.team);
        if (resolved?.error) return res.status(400).json({ message: resolved.error });
        project.leader = resolved.leader._id;
      }
    }

    await project.save();
    let leaderNotified = false;

    if (req.user.role === "admin" && project.team !== previousTeam) {
      const leader = await findTeamLeaderByTeam(project.team);
      if (leader) {
        project.leader = leader._id;
        await project.save();
        await createNotification({
          userId: leader._id,
          type: "project_assigned",
          message: `Admin assigned you a project: ${project.name}`,
          projectId: project._id,
          actorId: req.user._id,
        });
        leaderNotified = true;
      }
    }

    if (
      req.user.role === "admin" &&
      !leaderNotified &&
      project.leader &&
      project.leader.toString() !== previousLeader
    ) {
      await createNotification({
        userId: project.leader,
        type: "project_assigned",
        message: `Admin assigned you as project leader: ${project.name}`,
        projectId: project._id,
        actorId: req.user._id,
      });
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

export const getPerformanceStats = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }

  try {
    const windowDays = 30;
    const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const completedTasks = await Task.find({
      status: "completed",
      $or: [
        { completedAt: { $gte: cutoff } },
        { completedAt: { $exists: false }, updatedAt: { $gte: cutoff } },
        { completedAt: null, updatedAt: { $gte: cutoff } },
      ],
    }).populate("assignedTo", "name role team");

    const employeeCounts = new Map();
    const teamCounts = new Map();

    completedTasks.forEach((task) => {
      const assignee = task.assignedTo;
      if (!assignee) return;
      if (assignee.role === "member") {
        employeeCounts.set(
          assignee._id.toString(),
          (employeeCounts.get(assignee._id.toString()) || 0) + 1
        );
        if (assignee.team) {
          teamCounts.set(assignee.team, (teamCounts.get(assignee.team) || 0) + 1);
        }
      }
    });

    const leaders = await User.find({ role: "team_leader" }).select("name team");

    let bestLead = null;
    leaders.forEach((leader) => {
      const count = teamCounts.get(leader.team) || 0;
      if (!bestLead || count > bestLead.teamCompletedTasks) {
        bestLead = {
          id: leader._id,
          name: leader.name,
          team: leader.team,
          teamCompletedTasks: count,
        };
      }
    });

    let bestEmployee = null;
    if (employeeCounts.size) {
      const userIds = Array.from(employeeCounts.keys());
      const employees = await User.find({ _id: { $in: userIds } }).select("name team");
      employees.forEach((employee) => {
        const count = employeeCounts.get(employee._id.toString()) || 0;
        if (!bestEmployee || count > bestEmployee.completedTasks) {
          bestEmployee = {
            id: employee._id,
            name: employee.name,
            team: employee.team,
            completedTasks: count,
          };
        }
      });
    }

    return res.json({
      windowDays,
      generatedAt: new Date().toISOString(),
      bestLead,
      bestEmployee,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch performance stats." });
  }
};

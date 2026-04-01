import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Team from "../models/Team.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";

dotenv.config();

const teamNames = ["Orion", "Nimbus", "Atlas", "Pulse", "Zenith"];
const completionPercents = [30, 50, 80, 100, 60];

const ensureAdmin = async () => {
  const adminEmail = (process.env.ADMIN_EMAIL || "admin@taskflow.com").toLowerCase();
  let admin = await User.findOne({ email: adminEmail });
  if (admin) return admin;
  admin = await User.create({
    name: process.env.ADMIN_NAME || "TaskFlow Admin",
    email: adminEmail,
    password: process.env.ADMIN_PASSWORD || "admin123",
    role: "admin",
    team: process.env.ADMIN_TEAM || "Management",
    experienceYears: 10,
  });
  return admin;
};

const seed = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }

  await mongoose.connect(process.env.MONGO_URI);
  const admin = await ensureAdmin();

  // Reset operational data
  await Notification.deleteMany({});
  await Task.deleteMany({});
  await Project.deleteMany({});
  await Team.deleteMany({});

  // Keep admin and rebuild employee base from scratch
  await User.deleteMany({ role: { $ne: "admin" } });

  const createdTeams = [];

  for (let i = 0; i < teamNames.length; i += 1) {
    const teamName = teamNames[i];
    const leader = await User.create({
      name: `${teamName} Lead`,
      email: `${teamName.toLowerCase()}.lead@taskflow.com`,
      password: "lead123",
      role: "team_leader",
      team: teamName,
      experienceYears: 6 + i,
    });

    const members = [];
    for (let m = 1; m <= 5; m += 1) {
      const member = await User.create({
        name: `${teamName} Member ${m}`,
        email: `${teamName.toLowerCase()}.member${m}@taskflow.com`,
        password: "member123",
        role: "member",
        team: teamName,
        experienceYears: 1 + ((m + i) % 5),
      });
      members.push(member);
    }

    const team = await Team.create({
      name: teamName,
      leader: leader._id,
      members: members.map((u) => u._id),
      createdBy: admin._id,
    });

    createdTeams.push({ team, leader, members });
  }

  for (let i = 0; i < createdTeams.length; i += 1) {
    const { team, leader, members } = createdTeams[i];
    const percent = completionPercents[i];
    const totalTasks = 10;
    const completedTasks = Math.round((percent / 100) * totalTasks);

    const project = await Project.create({
      name: `${team.name} Delivery Project`,
      description: `Demo project for ${team.name} team`,
      team: team.name,
      startDate: new Date(2026, 0, 1 + i * 5),
      endDate: new Date(2026, 3, 10 + i * 3),
      status: percent === 100 ? "completed" : "active",
      specifications: ["API", "Frontend", "Testing"],
      members: [admin._id, leader._id, ...members.map((m) => m._id)],
      createdBy: admin._id,
    });

    for (let t = 0; t < totalTasks; t += 1) {
      const assignedTo = t === 0 ? leader._id : members[t % members.length]._id;
      await Task.create({
        title: `${team.name} Task ${t + 1}`,
        project: project._id,
        assignedTo,
        assignedTeam: team.name,
        priority: t % 3 === 0 ? "high" : t % 3 === 1 ? "medium" : "low",
        status: t < completedTasks ? "completed" : "pending",
        dueDate: new Date(2026, 4, 1 + t),
      });
    }
  }

  const totalUsers = await User.countDocuments({});
  const totalProjects = await Project.countDocuments({});
  const totalTasks = await Task.countDocuments({});

  console.log("Demo seed complete");
  console.log(`Users: ${totalUsers}, Projects: ${totalProjects}, Tasks: ${totalTasks}`);
  console.log("Completion targets:", completionPercents.join(", "));
  console.log("Team size rule: 1 leader + 5 members per team");

  await mongoose.disconnect();
};

seed()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Seed failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });

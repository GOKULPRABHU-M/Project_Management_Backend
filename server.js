import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import User from "./models/User.js";

import authRoutes from "./routes/auth.js";
import projectRoutes from "./routes/projects.js";
import taskRoutes from "./routes/tasks.js";
import userRoutes from "./routes/users.js";
import teamRoutes from "./routes/teams.js";
import notificationRoutes from "./routes/notifications.js";
import { runNotificationChecks, startNotificationScheduler } from "./utils/notificationScheduler.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", service: "task-manager-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/users", userRoutes);
app.use("/api/teams", teamRoutes);
app.use("/api/notifications", notificationRoutes);

const ensureDefaultAdmin = async () => {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@taskflow.com";
  const existingAdmin = await User.findOne({ email: adminEmail.toLowerCase() });
  if (existingAdmin) return;

  await User.create({
    name: process.env.ADMIN_NAME || "TaskFlow Admin",
    email: adminEmail.toLowerCase(),
    password: process.env.ADMIN_PASSWORD || "admin123",
    role: "admin",
    team: process.env.ADMIN_TEAM || "Management",
  });
  console.log(`Default admin created: ${adminEmail}`);
};

const migrateLegacyRoles = async () => {
  await User.updateMany({ role: "manager" }, { $set: { role: "team_leader" } });
};

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  if (!process.env.MONGO_URI) {
    console.error("Missing MONGO_URI in .env file");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");
    await migrateLegacyRoles();
    await ensureDefaultAdmin();
    await runNotificationChecks();
    startNotificationScheduler();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

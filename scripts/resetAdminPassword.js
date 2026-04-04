import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const getNewPassword = () => {
  const argPassword = process.argv[2];
  return (argPassword && argPassword.trim()) || process.env.ADMIN_PASSWORD || "admin123";
};

const getAdminEmail = () =>
  (process.env.ADMIN_EMAIL || "admin@taskflow.com").toLowerCase().trim();

const run = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing in .env");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const adminEmail = getAdminEmail();
  const newPassword = getNewPassword();

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: process.env.ADMIN_NAME || "TaskFlow Admin",
      email: adminEmail,
      password: newPassword,
      role: "admin",
      team: process.env.ADMIN_TEAM || "Management",
    });
    console.log(`Admin created: ${adminEmail}`);
  } else {
    admin.password = newPassword;
    await admin.save();
    console.log(`Admin password reset: ${adminEmail}`);
  }

  await mongoose.disconnect();
};

run()
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error("Reset failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });

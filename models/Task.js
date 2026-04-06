import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  assignedTeam: { type: String, default: "General" },
  priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
  status: { type: String, enum: ["pending", "completed"], default: "pending" },
  dueDate: { type: Date },
  completedAt: { type: Date },
  dueSoonNotifiedAt: { type: Date },
  overdueNotifiedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model("Task", taskSchema);

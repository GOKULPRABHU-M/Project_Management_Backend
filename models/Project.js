import mongoose from "mongoose";

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  team: { type: String, default: "General" },
  leader: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  startDate: { type: Date },
  endDate: { type: Date },
  status: { type: String, enum: ["active", "completed", "upcoming"], default: "active" },
  category: { type: String, default: "" },
  priority: { type: String, default: "medium" },
  template: { type: String, default: "" },
  icon: { type: String, default: "" },
  themeColor: { type: String, default: "" },
  dueSoonNotifiedAt: { type: Date },
  specifications: [{ type: String }],
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export default mongoose.model("Project", projectSchema);

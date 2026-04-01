import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "team_leader", "member"],
    default: "member",
  },
  team: { type: String, default: "General" },
  experienceYears: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

// Hash password before saving
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(password){
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);

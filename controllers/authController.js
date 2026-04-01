import User from "../models/User.js";
import jwt from "jsonwebtoken";

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

export const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, team } = req.body;
    const normalizedRole = role === "manager" ? "team_leader" : role;
    const allowedRoles = ["admin", "team_leader", "member"];
    if (normalizedRole && !allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ message: "Invalid role." });
    }
    const userExists = await User.findOne({ email: email?.toLowerCase().trim() });
    if (userExists) return res.status(400).json({ message: "User already exists." });

    const user = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      role: normalizedRole || "member",
      team: team || "General",
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      experienceYears: user.experienceYears || 0,
      token: generateToken(user._id),
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to create user." });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase().trim() });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    return res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      team: user.team,
      experienceYears: user.experienceYears || 0,
      token: generateToken(user._id),
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed." });
  }
};

export const getCurrentUser = async (req, res) => {
  return res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user.role,
    team: req.user.team,
    experienceYears: req.user.experienceYears || 0,
  });
};

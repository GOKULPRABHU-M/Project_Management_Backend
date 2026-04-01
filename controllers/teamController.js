import Team from "../models/Team.js";
import User from "../models/User.js";

export const getTeams = async (_req, res) => {
  try {
    const teams = await Team.find({})
      .populate("leader", "name email role team")
      .populate("members", "name email role team")
      .sort({ name: 1 });
    return res.json(teams);
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch teams." });
  }
};

export const createTeam = async (req, res) => {
  try {
    const { name, leaderId, memberIds = [] } = req.body;
    const trimmedName = name?.trim();
    if (!trimmedName) {
      return res.status(400).json({ message: "Team name is required." });
    }
    if (!leaderId) {
      return res.status(400).json({ message: "Team leader is required." });
    }

    const existingTeam = await Team.findOne({ name: trimmedName });
    if (existingTeam) {
      return res.status(400).json({ message: "Team already exists." });
    }

    const leader = await User.findById(leaderId);
    if (!leader) {
      return res.status(404).json({ message: "Leader user not found." });
    }
    if (leader.role === "admin") {
      return res.status(400).json({ message: "Admin cannot be team leader." });
    }

    const uniqueMemberIds = [...new Set(memberIds.map((id) => id?.toString()).filter(Boolean))]
      .filter((id) => id !== leaderId.toString());

    const memberUsers = await User.find({ _id: { $in: uniqueMemberIds } });
    if (memberUsers.length !== uniqueMemberIds.length) {
      return res.status(400).json({ message: "One or more member users not found." });
    }
    if (memberUsers.some((user) => user.role === "admin")) {
      return res.status(400).json({ message: "Admin cannot be team member." });
    }

    const team = await Team.create({
      name: trimmedName,
      leader: leader._id,
      members: memberUsers.map((user) => user._id),
      createdBy: req.user._id,
    });

    leader.role = "team_leader";
    leader.team = trimmedName;
    await leader.save();

    if (memberUsers.length) {
      await User.updateMany(
        { _id: { $in: memberUsers.map((user) => user._id) } },
        { $set: { role: "member", team: trimmedName } }
      );
    }

    const hydrated = await Team.findById(team._id)
      .populate("leader", "name email role team")
      .populate("members", "name email role team");

    return res.status(201).json(hydrated);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Unable to create team." });
  }
};

import express from "express";
import { createTeam, getTeams } from "../controllers/teamController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getTeams);
router.post("/", authorizeRoles("admin"), createTeam);

export default router;

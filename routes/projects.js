import express from "express";
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectGrowth,
  getPerformanceStats,
} from "../controllers/projectController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

router.get("/", getProjects);            // GET all projects for logged-in user
router.get("/growth", getProjectGrowth); // GET growth metrics (admin)
router.get("/performance", getPerformanceStats); // GET best lead/employee (admin)
router.post("/", createProject);         // CREATE new project
router.put("/:id", updateProject);       // UPDATE project
router.delete("/:id", deleteProject);    // DELETE project

export default router;

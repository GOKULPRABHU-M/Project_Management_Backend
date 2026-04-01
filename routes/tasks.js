import express from "express";
import { getTasks, createTask, updateTask, deleteTask } from "../controllers/taskController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();
router.use(protect);

// GET tasks for a project
router.get("/project/:projectId", getTasks);

// CREATE task in project
router.post("/project/:projectId", createTask);

// UPDATE task
router.put("/:id", updateTask);

// DELETE task
router.delete("/:id", deleteTask);

export default router;

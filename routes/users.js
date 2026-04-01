import express from "express";
import { createEmployee, getUsers, updateEmployee } from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getUsers);
router.post("/", protect, createEmployee);
router.put("/:id", protect, updateEmployee);

export default router;

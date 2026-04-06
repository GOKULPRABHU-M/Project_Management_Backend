import express from "express";
import {
  createWarningNotification,
  getNotifications,
  getLeaderWarningHistory,
  markNotificationRead,
} from "../controllers/notificationController.js";
import { authorizeRoles, protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);
router.get("/", getNotifications);
router.post("/", authorizeRoles("admin"), createWarningNotification);
router.get("/leader/:leaderId/warnings", authorizeRoles("admin"), getLeaderWarningHistory);
router.put("/:id/read", markNotificationRead);

export default router;

import { Router } from "express";
import { dbGetLogs } from "../lib/db.js";

const router = Router();

router.get("/logs", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 100);
    const logs = await dbGetLogs(req.user.id, limit);
    res.json({ logs });
  } catch (error) {
    next(error);
  }
});

export default router;

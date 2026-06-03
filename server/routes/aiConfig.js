import { Router } from "express";
import { getAiConfig, saveAiConfig } from "../lib/pipeline.js";

const router = Router();

router.get("/ai-config", async (_req, res, next) => {
  try {
    res.json({ config: await getAiConfig() });
  } catch (error) {
    next(error);
  }
});

router.put("/ai-config", async (req, res, next) => {
  try {
    res.json({ config: await saveAiConfig(req.body || {}) });
  } catch (error) {
    next(error);
  }
});

export default router;

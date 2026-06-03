import { Router } from "express";
import { getAiConfig } from "../lib/pipeline.js";

const router = Router();

router.get("/health", async (_req, res, next) => {
  try {
    const aiConfig = await getAiConfig();
    res.json({
      ok: true,
      service: "VATh API",
      aiExternalEnabled: Boolean(aiConfig.enabled && aiConfig.apiKeyConfigured),
      aiProvider: aiConfig.provider,
    });
  } catch (error) {
    next(error);
  }
});

export default router;

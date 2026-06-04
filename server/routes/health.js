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

router.get("/health/debug", async (_req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  res.json({
    supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : "NOT SET",
    supabaseKeyPrefix: supabaseKey ? `${supabaseKey.substring(0, 20)}...` : "NOT SET",
    supabaseKeyLength: supabaseKey?.length || 0,
    corsOrigin: process.env.CORS_ORIGIN,
  });
});

export default router;

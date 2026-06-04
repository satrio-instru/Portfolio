import { Router } from "express";
import { dbGetAiConfig, dbSaveAiConfig, dbLog } from "../lib/db.js";
import { defaultAiPrompt } from "../lib/pipeline.js";

const router = Router();

router.get("/ai-config", async (req, res, next) => {
  try {
    const config = await dbGetAiConfig(req.user.id);
    const defaults = {
      enabled: false,
      provider: "mimo",
      compatibility: "anthropic",
      model: "mimo-v2.5-pro",
      baseUrl: "https://api.xiaomimimo.com/anthropic",
      apiKey: "",
      maxTokens: 4000,
      anthropicVersion: "2023-06-01",
      prompt: defaultAiPrompt,
    };
    const merged = config
      ? {
          enabled: config.enabled,
          provider: config.provider,
          compatibility: config.compatibility,
          model: config.model,
          baseUrl: config.base_url,
          apiKeyConfigured: Boolean(config.api_key),
          apiKeyPreview: config.api_key ? `${config.api_key.substring(0, 8)}...` : "",
          maxTokens: config.max_tokens,
          anthropicVersion: config.anthropic_version,
          prompt: config.prompt || defaults.prompt,
        }
      : defaults;

    res.json({ config: merged });
  } catch (error) {
    next(error);
  }
});

router.put("/ai-config", async (req, res, next) => {
  try {
    const input = req.body || {};
    const saved = await dbSaveAiConfig(req.user.id, input);
    await dbLog(req.user.id, "ai_config_update", `AI config updated: provider=${saved.provider}, model=${saved.model}`);

    res.json({
      config: {
        enabled: saved.enabled,
        provider: saved.provider,
        compatibility: saved.compatibility,
        model: saved.model,
        baseUrl: saved.base_url,
        apiKeyConfigured: Boolean(saved.api_key),
        apiKeyPreview: saved.api_key ? `${saved.api_key.substring(0, 8)}...` : "",
        maxTokens: saved.max_tokens,
        anthropicVersion: saved.anthropic_version,
        prompt: saved.prompt,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

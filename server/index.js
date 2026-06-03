import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ensureStorage } from "./lib/pipeline.js";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRoutes from "./routes/health.js";
import datasetRoutes from "./routes/datasets.js";
import aiConfigRoutes from "./routes/aiConfig.js";
import exportRoutes from "./routes/export.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4174);

await ensureStorage();

const app = express();

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));

app.use(express.json({ limit: "4mb" }));

// Public routes
app.use("/api", healthRoutes);

// Protected routes
app.use("/api", authMiddleware, datasetRoutes);
app.use("/api", authMiddleware, aiConfigRoutes);
app.use("/api", authMiddleware, exportRoutes);

// Static serving for production
const distDir = path.join(projectRoot, "dist");
app.use(express.static(distDir));
app.get(/.*/, async (_request, response, next) => {
  try {
    await fs.access(path.join(distDir, "index.html"));
    response.sendFile(path.join(distDir, "index.html"));
  } catch (error) {
    if (error.code === "ENOENT") {
      response.status(404).json({
        error: "Frontend belum dibuild. Jalankan npm run build.",
      });
      return;
    }
    next(error);
  }
});

// Error handler
app.use(errorHandler);

app.listen(port, "0.0.0.0", () => {
  console.log(`VATh API running at http://0.0.0.0:${port}`);
});

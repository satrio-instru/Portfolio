import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import healthRoutes from "./routes/health.js";
import datasetRoutes from "./routes/datasets.js";
import aiConfigRoutes from "./routes/aiConfig.js";
import logRoutes from "./routes/logs.js";
import exportRoutes from "./routes/export.js";
import migrateRoutes from "./routes/migrate.js";

const port = Number(process.env.PORT || 4174);

console.log("─".repeat(50));
console.log("VATh API Configuration:");
console.log(`  PORT: ${port}`);
console.log(`  CORS_ORIGIN: ${process.env.CORS_ORIGIN || "http://localhost:5173"}`);
console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? "✅ set" : "❌ NOT SET"}`);
console.log(`  SUPABASE_SERVICE_KEY: ${process.env.SUPABASE_SERVICE_KEY ? "✅ set" : "❌ NOT SET"}`);
console.log("─".repeat(50));

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  credentials: true,
}));

app.use(express.json({ limit: "4mb" }));

// Public routes
app.use("/api", healthRoutes);
app.use("/api", migrateRoutes);

// Protected routes
app.use("/api", authMiddleware, datasetRoutes);
app.use("/api", authMiddleware, aiConfigRoutes);
app.use("/api", authMiddleware, logRoutes);
app.use("/api", authMiddleware, exportRoutes);

app.use(errorHandler);

app.listen(port, "0.0.0.0", () => {
  console.log(`VATh API running at http://0.0.0.0:${port}`);
});

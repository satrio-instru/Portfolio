import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = Router();

// GET /api/migrate-sql - Returns the SQL migration to run in Supabase dashboard
router.get("/migrate-sql", async (_req, res) => {
  try {
    const sqlPath = path.join(__dirname, "..", "migrations", "001_init.sql");
    const sql = await fs.readFile(sqlPath, "utf8");
    res.type("text/plain").send(sql);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

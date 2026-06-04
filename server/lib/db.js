import { createClient } from "@supabase/supabase-js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("⚠️  SUPABASE_URL and/or SUPABASE_SERVICE_KEY not set.");
}

// Service-role client (bypasses RLS for server operations)
export const db = createClient(supabaseUrl || "", supabaseServiceKey || "");

// Run migration SQL on startup
export async function runMigrations() {
  try {
    const migrationPath = path.join(__dirname, "..", "migrations", "001_init.sql");
    const sql = await fs.readFile(migrationPath, "utf8");

    // Split by semicolons and execute each statement
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    let success = 0;
    let errors = 0;

    for (const statement of statements) {
      try {
        const { error } = await db.rpc("exec_sql", { sql_text: statement + ";" });
        if (error) {
          // Try direct query for DDL
          const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: "POST",
            headers: {
              apikey: supabaseServiceKey,
              Authorization: `Bearer ${supabaseServiceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql_text: statement + ";" }),
          });
          if (!res.ok) {
            errors++;
          } else {
            success++;
          }
        } else {
          success++;
        }
      } catch {
        errors++;
      }
    }

    console.log(`Migrations: ${success} succeeded, ${errors} skipped/failed`);
  } catch (err) {
    console.warn("Migration file not found or failed:", err.message);
  }
}

// ── Dataset DB operations ────────────────────────────────────────────

export async function dbListDatasets(userId) {
  const { data, error } = await db
    .from("datasets")
    .select("id, original_name, file_size, summary, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function dbGetDataset(userId, id) {
  const { data, error } = await db
    .from("datasets")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function dbSaveDataset(userId, analysis) {
  const row = {
    id: analysis.metadata.id,
    user_id: userId,
    original_name: analysis.metadata.originalName,
    stored_name: analysis.metadata.storedFileName || analysis.metadata.id,
    file_size: analysis.metadata.fileSize || 0,
    sheet_name: analysis.metadata.selectedSheet || "Sheet1",
    metadata: analysis.metadata,
    schema_info: analysis.schema,
    summary: analysis.summary,
    charts: analysis.charts,
    anomalies: analysis.anomalies || [],
    employee_reports: analysis.employeeReports || [],
    shift_sessions: analysis.shiftSessions || [],
    vulnerability_summary: analysis.vulnerabilitySummary || {},
    ai: analysis.ai || {},
    records: analysis.recordsSample || [],
    algorithms: analysis.algorithms || [],
    shift_config: analysis.shiftConfig || {},
    anomaly_limit: analysis.anomalyLimit || {},
    status: "analyzed",
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("datasets")
    .upsert(row, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return row;
}

export async function dbUpdateDataset(userId, id, updates) {
  const { error } = await db
    .from("datasets")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function dbDeleteDataset(userId, id) {
  const { error } = await db
    .from("datasets")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── AI Config DB operations ──────────────────────────────────────────

export async function dbGetAiConfig(userId) {
  const { data, error } = await db
    .from("ai_configs")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(error.message);
  return data || null;
}

export async function dbSaveAiConfig(userId, config) {
  const row = {
    user_id: userId,
    enabled: config.enabled ?? false,
    provider: config.provider || "mimo",
    compatibility: config.compatibility || "anthropic",
    model: config.model || "mimo-v2.5-pro",
    base_url: config.baseUrl || "https://api.xiaomimimo.com/anthropic",
    api_key: config.apiKey || "",
    max_tokens: config.maxTokens || 4000,
    anthropic_version: config.anthropicVersion || "2023-06-01",
    prompt: config.prompt || "",
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from("ai_configs")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  return row;
}

// ── Activity Log DB operations ───────────────────────────────────────

export async function dbLog(userId, action, details = "", level = "info") {
  try {
    await db.from("activity_logs").insert({
      user_id: userId,
      action,
      details,
      level,
    });
  } catch {
    // Don't fail the main operation if logging fails
  }
}

export async function dbGetLogs(userId, limit = 100) {
  const { data, error } = await db
    .from("activity_logs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

// ── File Storage ─────────────────────────────────────────────────────

export async function dbUploadFile(userId, fileName, fileBuffer) {
  const filePath = `${userId}/${fileName}`;
  const { error } = await db.storage
    .from("datasets")
    .upload(filePath, fileBuffer, { upsert: true });
  if (error) throw new Error(error.message);
  return filePath;
}

export async function dbDownloadFile(userId, fileName) {
  const filePath = `${userId}/${fileName}`;
  const { data, error } = await db.storage
    .from("datasets")
    .download(filePath);
  if (error) throw new Error(error.message);
  return data;
}

export async function dbDeleteFile(userId, fileName) {
  const filePath = `${userId}/${fileName}`;
  const { error } = await db.storage
    .from("datasets")
    .remove([filePath]);
  if (error) throw new Error(error.message);
}

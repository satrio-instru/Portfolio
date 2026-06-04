import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  getTempRoot,
  processAndStoreFile,
  loadAnalysis,
  runLocalAnalysis,
  runDatasetAiAnalysis,
} from "../lib/pipeline.js";
import {
  dbListDatasets,
  dbGetDataset,
  dbSaveDataset,
  dbDeleteDataset,
  dbUploadFile,
  dbDownloadFile,
  dbDeleteFile,
  dbLog,
} from "../lib/db.js";

const router = Router();

const upload = multer({
  dest: getTempRoot(),
  limits: { fileSize: 250 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = [".xls", ".xlsx", ".csv", ".tsv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error("File harus .xls, .xlsx, .csv, atau .tsv."));
    cb(null, true);
  },
});

// ── Chunked upload state ─────────────────────────────────────────────
const chunkUploads = new Map();

function cleanupUpload(uploadId) {
  const entry = chunkUploads.get(uploadId);
  if (entry) {
    fs.rm(entry.dir, { recursive: true, force: true }).catch(() => {});
    chunkUploads.delete(uploadId);
  }
}

// ── Chunked upload: init ─────────────────────────────────────────────
router.post("/datasets/upload-init", async (req, res, next) => {
  try {
    const { originalName, totalChunks } = req.body;
    if (!originalName || !totalChunks)
      return res.status(400).json({ error: "originalName dan totalChunks wajib." });

    const allowed = [".xls", ".xlsx", ".csv", ".tsv"];
    const ext = path.extname(originalName).toLowerCase();
    if (!allowed.includes(ext))
      return res.status(400).json({ error: "File harus .xls, .xlsx, .csv, atau .tsv." });

    const uploadId = crypto.randomUUID();
    const dir = path.join(getTempRoot(), `chunked-${uploadId}`);
    await fs.mkdir(dir, { recursive: true });
    chunkUploads.set(uploadId, { dir, originalName, chunks: new Map(), totalChunks });
    setTimeout(() => cleanupUpload(uploadId), 10 * 60 * 1000);

    await dbLog(req.user.id, "upload_init", `Chunked upload started: ${originalName} (${totalChunks} chunks)`);
    res.json({ uploadId });
  } catch (error) {
    next(error);
  }
});

// ── Chunked upload: receive chunk ────────────────────────────────────
const chunkMulter = multer({ dest: getTempRoot() });

router.put("/datasets/upload-chunk/:uploadId", chunkMulter.single("chunk"), async (req, res, next) => {
  try {
    const entry = chunkUploads.get(req.params.uploadId);
    if (!entry) return res.status(404).json({ error: "Upload session tidak ditemukan." });

    const index = Number(req.body.index);
    if (isNaN(index) || !req.file)
      return res.status(400).json({ error: "index dan chunk wajib." });

    const chunkPath = path.join(entry.dir, `chunk-${index}`);
    await fs.rename(req.file.path, chunkPath);
    entry.chunks.set(index, chunkPath);

    res.json({ received: index, total: entry.totalChunks });
  } catch (error) {
    next(error);
  }
});

// ── Chunked upload: assemble & process ───────────────────────────────
router.post("/datasets/upload-complete/:uploadId", async (req, res, next) => {
  try {
    const entry = chunkUploads.get(req.params.uploadId);
    if (!entry) return res.status(404).json({ error: "Upload session tidak ditemukan." });
    if (entry.chunks.size !== entry.totalChunks)
      return res.status(400).json({ error: `Chunk belum lengkap: ${entry.chunks.size}/${entry.totalChunks}` });

    const ext = path.extname(entry.originalName).toLowerCase();
    const assembledPath = path.join(entry.dir, `assembled${ext}`);
    const ws = (await import("node:fs")).createWriteStream(assembledPath);
    for (let i = 0; i < entry.totalChunks; i++) {
      ws.write(await fs.readFile(entry.chunks.get(i)));
    }
    ws.end();
    await new Promise((resolve, reject) => {
      ws.on("finish", resolve);
      ws.on("error", reject);
    });

    // Upload to Supabase Storage
    const fileBuffer = await fs.readFile(assembledPath);
    const storedName = `${Date.now()}-${entry.originalName}`;
    await dbUploadFile(req.user.id, storedName, fileBuffer);

    // Process
    const analysis = await processAndStoreFile(assembledPath, entry.originalName);
    analysis.metadata.fileSize = fileBuffer.length;
    analysis.metadata.storedFileName = storedName;

    // Save to DB
    await dbSaveDataset(req.user.id, analysis);
    await dbLog(req.user.id, "upload_complete", `File processed: ${entry.originalName} (${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB)`);
    cleanupUpload(req.params.uploadId);

    res.status(201).json({ dataset: analysis });
  } catch (error) {
    cleanupUpload(req.params.uploadId);
    next(error);
  }
});

// ── List datasets ────────────────────────────────────────────────────
router.get("/datasets", async (req, res, next) => {
  try {
    const rows = await dbListDatasets(req.user.id);
    const datasets = rows.map((r) => ({
      id: r.id,
      originalName: r.original_name,
      fileSize: r.file_size,
      summary: r.summary,
      status: r.status,
      createdAt: r.created_at,
    }));
    res.json({ datasets });
  } catch (error) {
    next(error);
  }
});

// ── Single file upload ───────────────────────────────────────────────
router.post("/datasets", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Tidak ada file." });

    // Upload to Supabase Storage
    const fileBuffer = await fs.readFile(req.file.path);
    const storedName = `${Date.now()}-${req.file.originalname}`;
    await dbUploadFile(req.user.id, storedName, fileBuffer);

    // Process
    const analysis = await processAndStoreFile(req.file.path, req.file.originalname);
    analysis.metadata.fileSize = req.file.size;
    analysis.metadata.storedFileName = storedName;

    // Save to DB
    await dbSaveDataset(req.user.id, analysis);
    await dbLog(req.user.id, "upload", `File uploaded: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)}MB)`);

    await fs.rm(req.file.path, { force: true });
    res.status(201).json({ dataset: analysis });
  } catch (error) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true });
    next(error);
  }
});

// ── Get dataset detail ───────────────────────────────────────────────
router.get("/datasets/:id", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    const dataset = {
      metadata: row.metadata,
      schema: row.schema_info,
      summary: row.summary,
      charts: row.charts,
      anomalies: row.anomalies,
      employeeReports: row.employee_reports,
      shiftSessions: row.shift_sessions,
      vulnerabilitySummary: row.vulnerability_summary,
      ai: row.ai,
      recordsSample: row.records,
      algorithms: row.algorithms,
      shiftConfig: row.shift_config,
      anomalyLimit: row.anomaly_limit,
    };
    res.json({ dataset });
  } catch (error) {
    next(error);
  }
});

// ── Get dataset records ──────────────────────────────────────────────
router.get("/datasets/:id/records", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    let records = row.records || [];
    const { offset, limit, employeeKey } = req.query;
    if (employeeKey) {
      records = records.filter((r) => r.person === employeeKey || r.values?.Name === employeeKey);
    }
    const start = Number(offset || 0);
    const end = start + Number(limit || 100);
    res.json({ records: records.slice(start, end), total: records.length });
  } catch (error) {
    next(error);
  }
});

// ── List employees ───────────────────────────────────────────────────
router.get("/datasets/:id/employees", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    let employees = row.employee_reports || [];
    const { q } = req.query;
    if (q) {
      const query = q.toLowerCase();
      employees = employees.filter(
        (e) => e.employeeKey?.toLowerCase().includes(query) || e.displayName?.toLowerCase().includes(query)
      );
    }
    res.json({ employees });
  } catch (error) {
    next(error);
  }
});

// ── Single employee ──────────────────────────────────────────────────
router.get("/datasets/:id/employees/:employeeKey", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    const employee = (row.employee_reports || []).find((e) => e.employeeKey === req.params.employeeKey);
    if (!employee) return res.status(404).json({ error: "Karyawan tidak ditemukan." });

    const records = (row.records || []).filter(
      (r) => r.person === req.params.employeeKey || r.values?.Name === req.params.employeeKey
    );
    res.json({ employee, records });
  } catch (error) {
    next(error);
  }
});

// ── Helper: reconstruct analysis object from DB row ──────────────────
function rowToAnalysis(row) {
  return {
    metadata: row.metadata,
    schema: row.schema_info,
    summary: row.summary,
    charts: row.charts,
    anomalies: row.anomalies,
    employeeReports: row.employee_reports,
    shiftSessions: row.shift_sessions,
    vulnerabilitySummary: row.vulnerability_summary,
    ai: row.ai,
    recordsSample: row.records,
    algorithms: row.algorithms,
    shiftConfig: row.shift_config,
    anomalyLimit: row.anomaly_limit,
  };
}

// ── Local analysis ───────────────────────────────────────────────────
router.post("/datasets/:id/analyze-local", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    const existing = rowToAnalysis(row);
    const analysis = await runLocalAnalysis(req.params.id, existing);
    await dbSaveDataset(req.user.id, analysis);
    await dbLog(req.user.id, "analyze_local", `Local analysis completed for ${req.params.id}`);
    res.json({ dataset: analysis });
  } catch (error) {
    next(error);
  }
});

// ── AI analysis ──────────────────────────────────────────────────────
router.post("/datasets/:id/analyze", async (req, res, next) => {
  try {
    await dbLog(req.user.id, "analyze_ai_start", "Starting AI analysis...");
    const row = await dbGetDataset(req.user.id, req.params.id);
    const existing = rowToAnalysis(row);
    const analysis = await runDatasetAiAnalysis(req.params.id, req.user.id, existing);
    await dbSaveDataset(req.user.id, analysis);
    await dbLog(req.user.id, "analyze_ai_done", `AI analysis completed: ${analysis.ai?.source || "local"}`);
    res.json({ dataset: analysis });
  } catch (error) {
    await dbLog(req.user.id, "analyze_ai_error", error.message, "error");
    next(error);
  }
});

// ── CSV exports ──────────────────────────────────────────────────────
router.get("/datasets/:id/employees.csv", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    const employees = row.employee_reports || [];
    const header = "employeeKey,displayName,department,riskScore,anomalyCount";
    const csv = [header, ...employees.map((e) => `${e.employeeKey},${e.displayName},${e.department},${e.riskScore},${e.anomalyCount}`)].join("\n");
    res.type("text/csv").send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/anomalies.csv", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    const anomalies = row.anomalies || [];
    const header = "rowNumber,type,severity,description,person,date";
    const csv = [header, ...anomalies.map((a) => `${a.rowNumber},"${a.type}",${a.severity},"${a.description}",${a.person || ""},${a.date || ""}`)].join("\n");
    res.type("text/csv").send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/chart-data.csv", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    const charts = row.charts || {};
    const daily = charts.dailyEvents || [];
    const header = "date,events,anomalies";
    const csv = [header, ...daily.map((d) => `${d.date},${d.events},${d.anomalies}`)].join("\n");
    res.type("text/csv").send(csv);
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/chart-data.json", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.id);
    res.json({ charts: row.charts || {} });
  } catch (error) {
    next(error);
  }
});

export default router;

import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  getTempRoot,
  getAnomaliesCsv,
  getChartDataCsv,
  getEmployeeReport,
  getEmployeeReportsCsv,
  listDatasets,
  listEmployeeReports,
  loadAnalysis,
  processAndStoreFile,
  readRecords,
  runDatasetAiAnalysis,
  runLocalAnalysis,
} from "../lib/pipeline.js";

const router = Router();

const upload = multer({
  dest: getTempRoot(),
  limits: {
    fileSize: Number(process.env.MAX_UPLOAD_MB || 250) * 1024 * 1024,
  },
  fileFilter(_request, file, callback) {
    const allowed = [".xls", ".xlsx", ".csv", ".tsv"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      callback(new Error("File harus berupa .xls, .xlsx, .csv, atau .tsv."));
      return;
    }
    callback(null, true);
  },
});

// ── Chunked upload state ────────────────────────────────────────────
const chunkUploads = new Map(); // uploadId → { dir, originalName, chunks }

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
    if (!originalName || !totalChunks) {
      return res.status(400).json({ error: "originalName dan totalChunks wajib diisi." });
    }
    const allowed = [".xls", ".xlsx", ".csv", ".tsv"];
    const ext = path.extname(originalName).toLowerCase();
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: "File harus berupa .xls, .xlsx, .csv, atau .tsv." });
    }

    const uploadId = crypto.randomUUID();
    const dir = path.join(getTempRoot(), `chunked-${uploadId}`);
    await fs.mkdir(dir, { recursive: true });

    chunkUploads.set(uploadId, { dir, originalName, chunks: new Map(), totalChunks });

    // Auto-cleanup after 10 minutes
    setTimeout(() => cleanupUpload(uploadId), 10 * 60 * 1000);

    res.json({ uploadId });
  } catch (error) {
    next(error);
  }
});

// ── Chunked upload: receive chunk ────────────────────────────────────
router.put("/datasets/upload-chunk/:uploadId", upload.single("chunk"), async (req, res, next) => {
  try {
    const entry = chunkUploads.get(req.params.uploadId);
    if (!entry) return res.status(404).json({ error: "Upload session tidak ditemukan." });

    const index = Number(req.body.index);
    if (isNaN(index) || !req.file) {
      return res.status(400).json({ error: "index dan chunk file wajib." });
    }

    // Move chunk to persistent location
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

    if (entry.chunks.size !== entry.totalChunks) {
      return res.status(400).json({
        error: `Chunk belum lengkap: ${entry.chunks.size}/${entry.totalChunks}`,
      });
    }

    // Assemble chunks into single file
    const ext = path.extname(entry.originalName).toLowerCase();
    const assembledPath = path.join(entry.dir, `assembled${ext}`);
    const writeStream = (await import("node:fs")).createWriteStream(assembledPath);

    for (let i = 0; i < entry.totalChunks; i++) {
      const chunkData = await fs.readFile(entry.chunks.get(i));
      writeStream.write(chunkData);
    }
    writeStream.end();

    await new Promise((resolve, reject) => {
      writeStream.on("finish", resolve);
      writeStream.on("error", reject);
    });

    // Process the assembled file
    const analysis = await processAndStoreFile(assembledPath, entry.originalName);

    // Cleanup
    cleanupUpload(req.params.uploadId);

    res.status(201).json({ dataset: analysis });
  } catch (error) {
    cleanupUpload(req.params.uploadId);
    next(error);
  }
});

// ── Standard single-file upload ──────────────────────────────────────
router.get("/datasets", async (_req, res, next) => {
  try {
    res.json({ datasets: await listDatasets() });
  } catch (error) {
    next(error);
  }
});

router.post("/datasets", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Tidak ada file yang diupload." });
      return;
    }
    const analysis = await processAndStoreFile(req.file.path, req.file.originalname);
    await fs.rm(req.file.path, { force: true });
    res.status(201).json({ dataset: analysis });
  } catch (error) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true });
    next(error);
  }
});

router.get("/datasets/:id", async (req, res, next) => {
  try {
    res.json({ dataset: await loadAnalysis(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/datasets/:id/analyze-local", async (req, res, next) => {
  try {
    res.json({ dataset: await runLocalAnalysis(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/datasets/:id/analyze", async (req, res, next) => {
  try {
    res.json({ dataset: await runDatasetAiAnalysis(req.params.id) });
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/records", async (req, res, next) => {
  try {
    const offset = Math.max(0, Number(req.query.offset || 0));
    const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
    const employeeKey = String(req.query.employeeKey || "");
    res.json(await readRecords(req.params.id, { offset, limit, employeeKey }));
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/employees", async (req, res, next) => {
  try {
    res.json({
      employees: await listEmployeeReports(req.params.id, {
        query: String(req.query.q || ""),
      }),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/employees.csv", async (req, res, next) => {
  try {
    res.type("text/csv");
    res.attachment(`employees-${req.params.id}.csv`);
    res.send(await getEmployeeReportsCsv(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/employees/:employeeKey", async (req, res, next) => {
  try {
    res.json({
      employee: await getEmployeeReport(req.params.id, decodeURIComponent(req.params.employeeKey)),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/anomalies.csv", async (req, res, next) => {
  try {
    res.type("text/csv");
    res.attachment(`anomalies-${req.params.id}.csv`);
    res.send(await getAnomaliesCsv(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/chart-data.csv", async (req, res, next) => {
  try {
    res.type("text/csv");
    res.attachment(`chart-data-${req.params.id}.csv`);
    res.send(await getChartDataCsv(req.params.id));
  } catch (error) {
    next(error);
  }
});

router.get("/datasets/:id/chart-data.json", async (req, res, next) => {
  try {
    const analysis = await loadAnalysis(req.params.id);
    res.json(analysis.charts);
  } catch (error) {
    next(error);
  }
});

export default router;

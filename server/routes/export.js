import { Router } from "express";
import { dbGetDataset } from "../lib/db.js";
import { generateEmployeePdf, generateDatasetPdf, generateVisualizationPdf } from "../lib/pdf-generator.js";

const router = Router();

// Employee PDF
router.get("/export/pdf/:datasetId/:employeeKey", async (req, res, next) => {
  try {
    const { datasetId, employeeKey } = req.params;
    const row = await dbGetDataset(req.user.id, datasetId);
    const dataset = {
      metadata: row.metadata,
      summary: row.summary,
      ai: row.ai,
      charts: row.charts,
      shiftConfig: row.shift_config,
    };
    const decodedKey = decodeURIComponent(employeeKey);
    const employee = (row.employee_reports || []).find((e) => e.employeeKey === decodedKey);
    if (!employee) return res.status(404).json({ error: "Karyawan tidak ditemukan." });

    const records = (row.records || []).filter(
      (r) => r.person === decodedKey || r.values?.Name === decodedKey
    );

    const pdfBuffer = await generateEmployeePdf({ employee, analysis: dataset, records });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report-${employee.displayName || decodedKey}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// Full dataset PDF
router.get("/export/pdf/:datasetId", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.datasetId);
    const dataset = {
      metadata: row.metadata,
      summary: row.summary,
      ai: row.ai,
      charts: row.charts,
      anomalies: row.anomalies,
      employeeReports: row.employee_reports,
      vulnerabilitySummary: row.vulnerability_summary,
      shiftConfig: row.shift_config,
    };

    const pdfBuffer = await generateDatasetPdf(dataset);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report-${row.original_name}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

// Visualization PDF
router.get("/export/visualization-pdf/:datasetId", async (req, res, next) => {
  try {
    const row = await dbGetDataset(req.user.id, req.params.datasetId);
    const dataset = {
      metadata: row.metadata,
      summary: row.summary,
      charts: row.charts,
      ai: row.ai,
      vulnerabilitySummary: row.vulnerability_summary,
      shiftConfig: row.shift_config,
    };

    const pdfBuffer = await generateVisualizationPdf(dataset);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="visualisasi-${row.original_name}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

export default router;

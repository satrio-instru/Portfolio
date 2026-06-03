import { Router } from "express";
import { loadAnalysis, getEmployeeReport } from "../lib/pipeline.js";
import { generateEmployeePdf } from "../lib/pdf-generator.js";

const router = Router();

router.get("/export/pdf/:datasetId/:employeeKey", async (req, res, next) => {
  try {
    const { datasetId, employeeKey } = req.params;
    const analysis = await loadAnalysis(datasetId);
    const employee = await getEmployeeReport(datasetId, decodeURIComponent(employeeKey));

    const pdfBuffer = await generateEmployeePdf({
      employee,
      analysis,
      datasetId,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="report-${employee.displayName || employeeKey}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
});

export default router;

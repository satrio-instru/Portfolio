import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const storageRoot = process.env.DATA_STORAGE_DIR
  ? path.resolve(process.env.DATA_STORAGE_DIR)
  : path.join(projectRoot, "server", "storage");

const datasetsRoot = path.join(storageRoot, "datasets");
const tempRoot = path.join(storageRoot, "tmp");
const aiConfigPath = path.join(storageRoot, "ai-config.json");
const maxAnomalies = Number(process.env.MAX_ANOMALIES || 2500);
const maxCollectedAnomalies = Number(process.env.MAX_COLLECTED_ANOMALIES || 50000);

const severityScore = {
  critical: 100,
  high: 80,
  medium: 55,
  low: 30,
  info: 10,
};

const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;
const shiftGraceMinutes = Number(process.env.SHIFT_GRACE_MINUTES || 5);
const overtimeWindowHours = Number(process.env.SHIFT_OVERTIME_WINDOW_HOURS || 4);

const shiftTemplates = {
  day: {
    id: "day",
    label: "08-16",
    startHour: 8,
    endHour: 16,
    breakStartHour: 12,
    breakEndHour: 13,
  },
  evening: {
    id: "evening",
    label: "16-24",
    startHour: 16,
    endHour: 24,
    breakStartHour: 18,
    breakEndHour: 19,
  },
  night: {
    id: "night",
    label: "24-08",
    startHour: 0,
    endHour: 8,
    breakStartHour: 4,
    breakEndHour: 5,
  },
};

const defaultAiPrompt =
  "Anda adalah senior workforce analytics auditor. Analisa data access-log dan shift dalam Bahasa Indonesia. Fokus pada keterlambatan, pulang cepat, lembur, keluar-masuk selama shift, anomali human error, vulnerability operasional, dan rekomendasi audit yang bisa ditindaklanjuti. Jangan mengarang di luar data JSON.";

export async function ensureStorage() {
  await fs.mkdir(datasetsRoot, { recursive: true });
  await fs.mkdir(tempRoot, { recursive: true });
}

export function getTempRoot() {
  return tempRoot;
}

export async function getAiConfig() {
  await ensureStorage();
  return publicAiConfig(await loadAiConfig());
}

export async function saveAiConfig(input = {}) {
  await ensureStorage();
  const existing = await loadAiConfig({ includeSecret: true });
  const provider = String(input.provider || existing.provider || "local").toLowerCase();
  const compatibility = String(input.compatibility || existing.compatibility || "anthropic").toLowerCase();
  const apiKeyInput = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const clearApiKey = Boolean(input.clearApiKey);
  const next = {
    enabled: Boolean(input.enabled),
    provider,
    compatibility,
    model: String(input.model || defaultModelFor(provider, compatibility)),
    baseUrl: String(input.baseUrl || defaultBaseUrlFor(provider, compatibility)),
    anthropicVersion: String(input.anthropicVersion || existing.anthropicVersion || "2023-06-01"),
    maxTokens: Number(input.maxTokens || existing.maxTokens || 1600),
    prompt: String(input.prompt || existing.prompt || defaultAiPrompt),
    apiKey: clearApiKey ? "" : apiKeyInput || existing.apiKey || "",
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(aiConfigPath, JSON.stringify(next, null, 2), "utf8");
  return publicAiConfig(next);
}

export async function runDatasetAiAnalysis(id) {
  const analysisPath = path.join(datasetsRoot, id, "analysis.json");
  const analysis = await loadAnalysis(id, { includeInternal: true });
  const enhanced = await enhanceWithExternalAi(analysis, { requireExternal: true });
  if (enhanced.ai?.externalAiError) {
    const error = new Error(`AI eksternal gagal: ${enhanced.ai.externalAiError}`);
    error.status = 502;
    throw error;
  }
  await fs.writeFile(analysisPath, JSON.stringify(enhanced, null, 2), "utf8");
  return redactInternalPaths(enhanced);
}

export async function runLocalAnalysis(id) {
  const analysisPath = path.join(datasetsRoot, id, "analysis.json");
  const analysis = await loadAnalysis(id, { includeInternal: true });
  const localNarrative = buildLocalAiNarrative(analysis.summary, analysis.anomalies, analysis.schema);
  analysis.ai = localNarrative;
  await fs.writeFile(analysisPath, JSON.stringify(analysis, null, 2), "utf8");
  return redactInternalPaths(analysis);
}

export async function processAndStoreFile(sourcePath, originalName = "dataset.xls") {
  await ensureStorage();

  const id = createDatasetId(originalName);
  const datasetDir = path.join(datasetsRoot, id);
  await fs.mkdir(datasetDir, { recursive: true });

  const safeName = sanitizeFileName(originalName);
  const storedFilePath = path.join(datasetDir, safeName);
  await fs.copyFile(sourcePath, storedFilePath);

  const parsed = await analyzeWorkbook(storedFilePath, {
    id,
    originalName,
    storedFilePath,
  });

  const recordsPath = path.join(datasetDir, "records.ndjson");
  await fs.writeFile(
    recordsPath,
    parsed.records.map((record) => JSON.stringify(record)).join("\n"),
    "utf8",
  );

  const analysis = {
    ...parsed.analysis,
    metadata: {
      ...parsed.analysis.metadata,
      id,
      originalName,
      storedFileName: safeName,
      createdAt: new Date().toISOString(),
      recordsPath,
      storedFilePath,
    },
  };

  const enhanced = await enhanceWithExternalAi(analysis);
  await fs.writeFile(
    path.join(datasetDir, "analysis.json"),
    JSON.stringify(enhanced, null, 2),
    "utf8",
  );

  return redactInternalPaths(enhanced);
}

export async function listDatasets() {
  await ensureStorage();
  const entries = await fs.readdir(datasetsRoot, { withFileTypes: true });
  const datasets = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const analysis = await loadAnalysis(entry.name, { includeInternal: true });
      datasets.push(redactDatasetListItem(analysis));
    } catch {
      // Ignore incomplete uploads.
    }
  }

  return datasets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadAnalysis(id, options = {}) {
  const analysisPath = path.join(datasetsRoot, id, "analysis.json");
  const data = JSON.parse(await fs.readFile(analysisPath, "utf8"));
  return options.includeInternal ? data : redactInternalPaths(data);
}

export async function readRecords(id, { offset = 0, limit = 100, employeeKey = "" } = {}) {
  const analysis = await loadAnalysis(id, { includeInternal: true });
  const recordsPath = analysis.metadata.recordsPath;
  const anomalyMap = new Map();

  for (const anomaly of analysis.anomalies || []) {
    const key = String(anomaly.rowNumber || "");
    if (!key) continue;
    const existing = anomalyMap.get(key) || {
      count: 0,
      maxSeverity: "info",
      types: new Set(),
    };
    existing.count += 1;
    existing.types.add(anomaly.type);
    if (severityScore[anomaly.severity] > severityScore[existing.maxSeverity]) {
      existing.maxSeverity = anomaly.severity;
    }
    anomalyMap.set(key, existing);
  }

  const results = [];
  let matchedIndex = 0;
  let matchedTotal = 0;

  if (!fsSync.existsSync(recordsPath)) {
    return { offset, limit, records: [], totalRows: analysis.summary.totalRows };
  }

  const input = fsSync.createReadStream(recordsPath, { encoding: "utf8" });
  const reader = createInterface({ input, crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (employeeKey && record.personKey !== employeeKey) continue;
    if (matchedIndex >= offset && results.length < limit) {
      const marker = anomalyMap.get(String(record.rowNumber));
      results.push({
        ...record,
        anomaly: marker
          ? {
              count: marker.count,
              maxSeverity: marker.maxSeverity,
              types: [...marker.types],
            }
          : null,
      });
    }
    matchedIndex += 1;
    matchedTotal += 1;
  }

  reader.close();
  return {
    offset,
    limit,
    records: results,
    totalRows: employeeKey ? matchedTotal : analysis.summary.totalRows,
    employeeKey: employeeKey || null,
  };
}

export async function listEmployeeReports(id, { query = "" } = {}) {
  const analysis = await loadAnalysis(id, { includeInternal: true });
  const normalized = query.trim().toLowerCase();
  const employees = analysis.employeeReports || [];

  return normalized
    ? employees.filter(
        (employee) =>
          employee.employeeKey.includes(normalized) ||
          employee.displayName.toLowerCase().includes(normalized) ||
          employee.department.toLowerCase().includes(normalized),
      )
    : employees;
}

export async function getEmployeeReport(id, employeeKey) {
  const employees = await listEmployeeReports(id);
  const employee = employees.find((item) => item.employeeKey === employeeKey);
  if (!employee) {
    const error = new Error("Karyawan tidak ditemukan pada dataset ini.");
    error.status = 404;
    throw error;
  }
  return employee;
}

export async function getEmployeeReportsCsv(id) {
  const employees = await listEmployeeReports(id);
  return toCsv(
    employees.map((employee) => ({
      employeeKey: employee.employeeKey,
      name: employee.displayName,
      department: employee.department,
      riskLevel: employee.riskLevel,
      riskScore: employee.riskScore,
      sessions: employee.metrics.sessions,
      lateCount: employee.metrics.lateCount,
      lateMinutes: employee.metrics.lateMinutes,
      earlyLeaveCount: employee.metrics.earlyLeaveCount,
      earlyLeaveMinutes: employee.metrics.earlyLeaveMinutes,
      overtimeCount: employee.metrics.overtimeCount,
      overtimeMinutes: employee.metrics.overtimeMinutes,
      workExitCycles: employee.metrics.workExitCycles,
      breakExitCycles: employee.metrics.breakExitCycles,
      anomalies: employee.anomalies?.total || 0,
    })),
  );
}

export async function getAnomaliesCsv(id) {
  const analysis = await loadAnalysis(id, { includeInternal: true });
  return toCsv(
    (analysis.anomalies || []).map((item) => ({
      severity: item.severity,
      type: item.type,
      rowNumber: item.rowNumber,
      title: item.title,
      detail: item.detail,
      evidence: JSON.stringify(item.evidence || {}),
    })),
  );
}

export async function getChartDataCsv(id) {
  const analysis = await loadAnalysis(id, { includeInternal: true });
  const rows = [];

  for (const item of analysis.charts.dailyEvents || []) {
    rows.push({
      chart: "dailyEvents",
      label: item.date,
      events: item.events,
      anomalies: item.anomalies,
    });
  }

  for (const item of analysis.charts.hourlyDistribution || []) {
    rows.push({
      chart: "hourlyDistribution",
      label: item.hour,
      events: item.events,
      anomalies: item.anomalies,
    });
  }

  for (const [chartName, values] of Object.entries(analysis.charts.topBreakdowns || {})) {
    for (const item of values) {
      rows.push({
        chart: chartName,
        label: item.name,
        events: item.value,
        anomalies: "",
      });
    }
  }

  for (const item of analysis.charts.shiftCompliance || []) {
    rows.push({
      chart: "shiftCompliance",
      label: item.shift,
      events: item.sessions,
      anomalies: item.late + item.early + item.overtime,
    });
  }

  for (const item of analysis.charts.employeeRisk || []) {
    rows.push({
      chart: "employeeRisk",
      label: item.name,
      events: item.value,
      anomalies: item.late + item.early + item.overtime,
    });
  }

  for (const item of analysis.charts.heatmap || []) {
    rows.push({
      chart: "heatmap",
      label: item.label,
      events: item.events,
      anomalies: item.anomalies,
    });
  }

  return toCsv(rows);
}

export async function analyzeWorkbook(filePath, context = {}) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    dense: true,
    WTF: false,
  });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = sheet?.["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    const rowCount = range ? range.e.r - range.s.r + 1 : 0;
    const columnCount = range ? range.e.c - range.s.c + 1 : 0;
    return { name, rowCount, columnCount, score: rowCount * Math.max(columnCount, 1) };
  }).sort((a, b) => b.score - a.score);

  const selectedSheet = sheets[0]?.name;
  if (!selectedSheet) {
    throw new Error("Workbook tidak memiliki sheet yang bisa dibaca.");
  }

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[selectedSheet], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  const headerIndex = findHeaderRow(matrix);
  const headerCells = matrix[headerIndex] || [];
  const headers = buildHeaders(headerCells);
  const body = matrix.slice(headerIndex + 1);

  const rawRows = body
    .map((cells, index) => rowFromCells(headers, cells, headerIndex + index + 2))
    .filter((row) => hasUsefulCells(row.values));

  const schema = inferSchema(headers, rawRows);
  const records = rawRows.map((row) => enrichRow(row, schema));
  const analysis = buildAnalysis({
    context,
    sheets,
    selectedSheet,
    headerIndex,
    headers,
    schema,
    records,
  });

  return { analysis, records };
}

function buildAnalysis({ context, sheets, selectedSheet, headerIndex, headers, schema, records }) {
  const shiftAnalytics = buildShiftAnalytics(records);
  const anomalies = [];
  const addAnomaly = (record, type, severity, title, detail, evidence = {}) => {
    if (anomalies.length >= maxCollectedAnomalies) return;
    anomalies.push({
      id: `${type}-${record?.rowNumber || "dataset"}-${anomalies.length + 1}`,
      type,
      severity,
      rowNumber: record?.rowNumber || null,
      person: record?.person || "",
      date: record?.dateKey || "",
      title,
      detail,
      evidence,
      score: severityScore[severity] || 10,
    });
  };

  detectCompleteness(records, schema, addAnomaly);
  detectExactDuplicates(records, addAnomaly);
  detectAccessSpecificAnomalies(records, schema, addAnomaly);
  detectShiftAnomalies(shiftAnalytics.sessions, addAnomaly);
  detectDailyVolumeOutliers(records, addAnomaly);
  detectNumericOutliers(records, schema, addAnomaly);

  anomalies.sort((a, b) => b.score - a.score || (a.rowNumber || 0) - (b.rowNumber || 0));
  const visibleAnomalies = anomalies.slice(0, maxAnomalies);

  const anomalyRows = new Set(anomalies.map((item) => item.rowNumber).filter(Boolean));
  const employeeReports = attachEmployeeAnomalyStats(shiftAnalytics.employeeReports, anomalies);
  const vulnerabilitySummary = buildVulnerabilitySummary(employeeReports, anomalies, records);
  const summary = summarize(records, schema, anomalies, shiftAnalytics, vulnerabilitySummary);
  const charts = buildCharts(records, anomalies, schema, shiftAnalytics, employeeReports);
  const ai = buildLocalAiNarrative(summary, anomalies, schema);

  return {
    metadata: {
      id: context.id || "",
      originalName: context.originalName || path.basename(context.storedFilePath || "dataset"),
      selectedSheet,
      workbookSheets: sheets,
      headerRow: headerIndex + 1,
      analyzedAt: new Date().toISOString(),
      analyzerVersion: "2026.06-local-ai-1",
    },
    schema: {
      columns: headers.map((header) => header.label),
      inferred: schema,
    },
    summary,
    charts,
    anomalies: visibleAnomalies,
    anomalyLimit: {
      returned: visibleAnomalies.length,
      totalDetected: anomalies.length,
      capped: anomalies.length > visibleAnomalies.length,
    },
    anomalyRows: anomalyRows.size,
    shiftConfig: {
      graceMinutes: shiftGraceMinutes,
      overtimeWindowHours,
      shifts: Object.values(shiftTemplates).map(({ id, label, breakStartHour, breakEndHour }) => ({
        id,
        label,
        break: `${String(breakStartHour).padStart(2, "0")}:00-${String(breakEndHour).padStart(2, "0")}:00`,
      })),
    },
    employeeReports,
    shiftSessions: shiftAnalytics.sessions.slice(0, 500).map(toClientSession),
    vulnerabilitySummary,
    ai,
    recordsSample: records.slice(0, 40).map(toClientRecord),
    algorithms: [
      {
        name: "Schema inference",
        description: "Mendeteksi kolom tanggal, waktu, personel, departemen, device, event point, reader, dan angka dari nama kolom serta rasio nilai valid.",
      },
      {
        name: "Duplicate hashing",
        description: "Membuat signature baris dari semua kolom untuk mencari data ganda persis.",
      },
      {
        name: "Robust z-score / MAD",
        description: "Mendeteksi lonjakan jumlah event harian per personel dan outlier numerik tanpa mudah bias oleh nilai ekstrem.",
      },
      {
        name: "Access sequence engine",
        description: "Menganalisis urutan Plant-In dan Plant-Out per personel per hari untuk menemukan scan berulang, arah yang tidak berpasangan, dan turnaround terlalu cepat.",
      },
      {
        name: "LLM insight layer",
        description: "Ringkasan AI lokal selalu aktif; jika AI Config di UI menyimpan provider dan API key, backend dapat meminta LLM menyusun narasi audit yang lebih natural.",
      },
    ],
  };
}

function summarize(records, schema, anomalies, shiftAnalytics, vulnerabilitySummary) {
  const validDates = records.map((row) => row.dateKey).filter(Boolean).sort();
  const uniquePeople = new Set(records.map((row) => row.personKey).filter(Boolean));
  const severity = countBy(anomalies, (item) => item.severity);
  const types = countBy(anomalies, (item) => item.type);
  const missingCritical = anomalies.filter((item) => item.type === "missing_key_field").length;
  const shiftTotals = shiftAnalytics.totals;

  return {
    totalRows: records.length,
    validRows: records.filter((row) => row.isUsable).length,
    dateRange: {
      start: validDates[0] || "",
      end: validDates[validDates.length - 1] || "",
    },
    distinctPeople: uniquePeople.size,
    anomalyCount: anomalies.length,
    anomalyRate: records.length ? round(anomalies.length / records.length, 4) : 0,
    missingCritical,
    severity: {
      critical: severity.get("critical") || 0,
      high: severity.get("high") || 0,
      medium: severity.get("medium") || 0,
      low: severity.get("low") || 0,
      info: severity.get("info") || 0,
    },
    topAnomalyTypes: topFromMap(types, 8),
    topDepartments: topCounts(records, (row) => row.department, 8),
    topDevices: topCounts(records, (row) => row.device, 8),
    topEventPoints: topCounts(records, (row) => row.eventPoint, 8),
    topPersonnel: topCounts(records, (row) => row.person, 8),
    detectedMode: schema.eventPoint || schema.device ? "access-log" : "generic-table",
    shift: {
      sessions: shiftTotals.sessions,
      lateCount: shiftTotals.lateCount,
      lateMinutes: shiftTotals.lateMinutes,
      earlyLeaveCount: shiftTotals.earlyLeaveCount,
      earlyLeaveMinutes: shiftTotals.earlyLeaveMinutes,
      overtimeCount: shiftTotals.overtimeCount,
      overtimeMinutes: shiftTotals.overtimeMinutes,
      workExitCycles: shiftTotals.workExitCycles,
      breakExitCycles: shiftTotals.breakExitCycles,
      missingInSessions: shiftTotals.missingInSessions,
      missingOutSessions: shiftTotals.missingOutSessions,
    },
    vulnerability: vulnerabilitySummary.overview,
  };
}

function buildCharts(records, anomalies, schema, shiftAnalytics, employeeReports) {
  const recordByRow = new Map(records.map((record) => [record.rowNumber, record]));
  const anomalyByDate = countBy(anomalies, (item) => item.date || "Unknown");
  const anomalyByHour = countBy(
    anomalies,
    (item) => {
      const record = recordByRow.get(item.rowNumber);
      return record?.hourLabel || "Unknown";
    },
  );

  const daily = topSortedDate(countBy(records, (row) => row.dateKey || "Unknown")).map(
    ([date, events]) => ({
      date,
      events,
      anomalies: anomalyByDate.get(date) || 0,
    }),
  );

  const hourly = Array.from({ length: 24 }, (_, hour) => {
    const label = `${String(hour).padStart(2, "0")}:00`;
    return {
      hour: label,
      events: records.filter((row) => row.hour === hour).length,
      anomalies: anomalyByHour.get(label) || 0,
    };
  });

  const topBreakdowns = {
    departments: topCounts(records, (row) => row.department, 10),
    devices: topCounts(records, (row) => row.device, 10),
    eventPoints: topCounts(records, (row) => row.eventPoint, 10),
    verificationModes: topCounts(records, (row) => valueAt(row, schema.verification), 10),
    personnel: topCounts(records, (row) => row.person, 10),
  };

  return {
    dailyEvents: daily,
    hourlyDistribution: hourly,
    topBreakdowns,
    anomalySeverity: ["critical", "high", "medium", "low", "info"]
      .map((name) => ({
        name,
        value: anomalies.filter((item) => item.severity === name).length,
      }))
      .filter((item) => item.value > 0),
    anomalyTypes: topCounts(anomalies, (item) => item.type, 8),
    shiftCompliance: buildShiftComplianceChart(shiftAnalytics.sessions),
    employeeRisk: employeeReports
      .slice()
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 12)
      .map((employee) => ({
        name: employee.displayName,
        value: employee.riskScore,
        late: employee.metrics.lateCount,
        early: employee.metrics.earlyLeaveCount,
        overtime: employee.metrics.overtimeCount,
        exits: employee.metrics.workExitCycles,
      })),
    heatmap: buildHeatmap(records, anomalies),
  };
}

function buildShiftAnalytics(records) {
  const byPerson = new Map();

  for (const record of records) {
    if (!record.timestampMs || !record.personKey) continue;
    if (!byPerson.has(record.personKey)) byPerson.set(record.personKey, []);
    byPerson.get(record.personKey).push(record);
  }

  const sessions = [];
  const employeeMap = new Map();

  for (const [personKey, personRecords] of byPerson.entries()) {
    const sorted = personRecords.slice().sort((a, b) => a.timestampMs - b.timestampMs);
    let active = null;

    for (const record of sorted) {
      if (!active || shouldStartNewShiftSession(active, record)) {
        if (active) sessions.push(finalizeShiftSession(active));
        active = createShiftSession(record, personKey);
      }

      active.records.push(record);
      active.lastMs = record.timestampMs;
      record.shift = {
        id: active.shift.id,
        label: active.shift.label,
        workDate: active.workDate,
      };
    }

    if (active) sessions.push(finalizeShiftSession(active));
  }

  for (const session of sessions) {
    const key = session.personKey;
    if (!employeeMap.has(key)) {
      employeeMap.set(key, createEmployeeReportSeed(session));
    }
    addSessionToEmployeeReport(employeeMap.get(key), session);
  }

  const employeeReports = [...employeeMap.values()].map(finalizeEmployeeReport);
  const totals = employeeReports.reduce(
    (acc, employee) => {
      for (const [key, value] of Object.entries(employee.metrics)) {
        if (typeof value === "number") acc[key] = (acc[key] || 0) + value;
      }
      return acc;
    },
    {
      sessions: 0,
      lateCount: 0,
      lateMinutes: 0,
      earlyLeaveCount: 0,
      earlyLeaveMinutes: 0,
      overtimeCount: 0,
      overtimeMinutes: 0,
      workExitCycles: 0,
      breakExitCycles: 0,
      missingInSessions: 0,
      missingOutSessions: 0,
    },
  );

  return { sessions, employeeReports, totals };
}

function createShiftSession(record, personKey) {
  const shift = inferShiftWindow(record.timestampMs);
  return {
    id: `${personKey}-${shift.workDate}-${shift.id}-${record.rowNumber}`,
    personKey,
    person: record.person,
    department: record.department,
    shift,
    shiftId: shift.id,
    shiftLabel: shift.label,
    workDate: shift.workDate,
    startMs: shift.startMs,
    endMs: shift.endMs,
    breakStartMs: shift.breakStartMs,
    breakEndMs: shift.breakEndMs,
    windowEndMs: shift.endMs + overtimeWindowHours * hourMs,
    records: [],
    lastMs: record.timestampMs,
  };
}

function shouldStartNewShiftSession(active, record) {
  if (!record.timestampMs) return false;
  if (record.timestampMs > active.windowEndMs) return true;

  const inferred = inferShiftWindow(record.timestampMs);
  const lastRecord = active.records[active.records.length - 1];
  const longGap = lastRecord ? record.timestampMs - lastRecord.timestampMs > 10 * hourMs : false;
  const nearOrAfterEnd = record.timestampMs > active.endMs - 20 * minuteMs;
  const hasOut = active.records.some((item) => item.direction === "OUT");

  return (
    record.direction === "IN" &&
    inferred.id !== active.shiftId &&
    hasOut &&
    (nearOrAfterEnd || longGap)
  );
}

function inferShiftWindow(timestampMs) {
  const date = new Date(timestampMs);
  const hour = date.getHours();
  let template;
  let workDate = stripTime(date);

  if (hour >= 6 && hour < 14) {
    template = shiftTemplates.day;
  } else if (hour >= 14 && hour < 22) {
    template = shiftTemplates.evening;
  } else {
    template = shiftTemplates.night;
    if (hour >= 22) workDate = addDays(workDate, 1);
  }

  const start = dateAtHour(workDate, template.startHour);
  const end = dateAtHour(workDate, template.endHour);
  const breakStart = dateAtHour(workDate, template.breakStartHour);
  const breakEnd = dateAtHour(workDate, template.breakEndHour);

  return {
    ...template,
    workDate: formatDate(workDate),
    startMs: start.getTime(),
    endMs: end.getTime(),
    breakStartMs: breakStart.getTime(),
    breakEndMs: breakEnd.getTime(),
  };
}

function finalizeShiftSession(session) {
  const sorted = session.records.slice().sort((a, b) => a.timestampMs - b.timestampMs);
  const firstInRecord = sorted.find((record) => record.direction === "IN") || null;
  const lastOutRecord = sorted.findLast((record) => record.direction === "OUT") || null;
  const firstRecord = sorted[0] || null;
  const lastRecord = sorted[sorted.length - 1] || null;
  const durationMinutes =
    firstInRecord && lastOutRecord
      ? Math.max(0, Math.round((lastOutRecord.timestampMs - firstInRecord.timestampMs) / minuteMs))
      : 0;
  const lowConfidence = Boolean(firstInRecord && lastOutRecord && durationMinutes < 180 && sorted.length <= 4);

  const rawLateMinutes = firstInRecord
    ? Math.max(0, Math.round((firstInRecord.timestampMs - (session.startMs + shiftGraceMinutes * minuteMs)) / minuteMs))
    : 0;
  const rawEarlyLeaveMinutes = lastOutRecord
    ? Math.max(0, Math.round((session.endMs - shiftGraceMinutes * minuteMs - lastOutRecord.timestampMs) / minuteMs))
    : 0;
  const rawOvertimeMinutes = lastOutRecord
    ? Math.max(0, Math.round((lastOutRecord.timestampMs - (session.endMs + shiftGraceMinutes * minuteMs)) / minuteMs))
    : 0;
  const lateMinutes = lowConfidence ? 0 : rawLateMinutes;
  const earlyLeaveMinutes = lowConfidence ? 0 : rawEarlyLeaveMinutes;
  const overtimeMinutes = lowConfidence ? 0 : rawOvertimeMinutes;

  const cycleMetrics = countExitCycles(sorted, session);
  const inCount = sorted.filter((record) => record.direction === "IN").length;
  const outCount = sorted.filter((record) => record.direction === "OUT").length;

  return {
    ...session,
    records: sorted,
    rowNumbers: sorted.map((record) => record.rowNumber),
    firstIn: firstInRecord ? toTimePoint(firstInRecord) : null,
    lastOut: lastOutRecord ? toTimePoint(lastOutRecord) : null,
    firstInRecord,
    lastOutRecord,
    representativeRecord: firstInRecord || firstRecord || lastRecord,
    scanCount: sorted.length,
    durationMinutes,
    lowConfidence,
    inCount,
    outCount,
    lateMinutes,
    earlyLeaveMinutes,
    overtimeMinutes,
    workExitCycles: cycleMetrics.workExitCycles,
    breakExitCycles: cycleMetrics.breakExitCycles,
    longBreakMinutes: cycleMetrics.longBreakMinutes,
    exitCycles: cycleMetrics.cycles,
    missingIn: !firstInRecord,
    missingOut: !lastOutRecord,
    inOutImbalance: Math.abs(inCount - outCount),
    startTime: formatClock(new Date(session.startMs)),
    endTime: formatClock(new Date(session.endMs)),
  };
}

function countExitCycles(records, session) {
  const cycles = [];
  let workExitCycles = 0;
  let breakExitCycles = 0;
  let longBreakMinutes = 0;
  let openOut = null;

  for (const record of records) {
    if (record.direction === "OUT" && !openOut) {
      openOut = record;
      continue;
    }

    if (record.direction !== "IN" || !openOut) continue;

    const outRecord = openOut;
    const inRecord = record;
    const gapMinutes = Math.max(0, Math.round((inRecord.timestampMs - outRecord.timestampMs) / minuteMs));
    openOut = null;
    if (gapMinutes <= 0 || gapMinutes > 12 * 60) continue;

    const breakOverlapMs = Math.max(
      0,
      Math.min(inRecord.timestampMs, session.breakEndMs) -
        Math.max(outRecord.timestampMs, session.breakStartMs),
    );
    const overlapsBreak = breakOverlapMs >= Math.min(30 * minuteMs, (gapMinutes * minuteMs) / 2);
    const insideShift =
      outRecord.timestampMs >= session.startMs - 30 * minuteMs &&
      inRecord.timestampMs <= session.endMs + 30 * minuteMs;
    const kind = overlapsBreak ? "break" : insideShift ? "work" : "outside";

    if (kind === "break") {
      breakExitCycles += 1;
      if (gapMinutes > 75) longBreakMinutes += gapMinutes - 60;
    } else if (kind === "work") {
      workExitCycles += 1;
    }

    cycles.push({
      outRow: outRecord.rowNumber,
      inRow: inRecord.rowNumber,
      outAt: outRecord.timestamp,
      inAt: inRecord.timestamp,
      minutes: gapMinutes,
      kind,
    });
  }

  return { workExitCycles, breakExitCycles, longBreakMinutes, cycles };
}

function detectShiftAnomalies(sessions, addAnomaly) {
  for (const session of sessions) {
    if (session.lateMinutes > 0) {
      addAnomaly(
        session.firstInRecord,
        "late_arrival",
        session.lateMinutes > 30 ? "high" : "medium",
        "Karyawan terlambat dari awal shift",
        `Masuk ${session.lateMinutes} menit setelah jadwal shift ${session.shiftLabel}.`,
        sessionEvidence(session),
      );
    }

    if (session.earlyLeaveMinutes > 0) {
      addAnomaly(
        session.lastOutRecord,
        "early_departure",
        session.earlyLeaveMinutes > 30 ? "high" : "medium",
        "Pulang lebih cepat dari akhir shift",
        `Keluar ${session.earlyLeaveMinutes} menit sebelum jadwal akhir shift ${session.shiftLabel}.`,
        sessionEvidence(session),
      );
    }

    if (session.overtimeMinutes > 0) {
      addAnomaly(
        session.lastOutRecord,
        "overtime_session",
        session.overtimeMinutes > 120 ? "high" : "low",
        "Lembur terdeteksi",
        `Keluar ${session.overtimeMinutes} menit setelah akhir shift ${session.shiftLabel}.`,
        sessionEvidence(session),
      );
    }

    if (session.workExitCycles > 2) {
      addAnomaly(
        session.representativeRecord,
        "excessive_work_exits",
        session.workExitCycles > 5 ? "high" : "medium",
        "Keluar-masuk saat jam kerja tinggi",
        `Ada ${session.workExitCycles} siklus OUT-IN di luar jam istirahat.`,
        sessionEvidence(session),
      );
    }

    if (session.lowConfidence) {
      addAnomaly(
        session.representativeRecord,
        "short_shift_session",
        "medium",
        "Sesi shift terlalu pendek untuk payroll",
        "Sesi ini tampak seperti movement/rescan, bukan shift penuh. Telat, pulang cepat, dan lembur tidak dihitung dari sesi ini.",
        {
          ...sessionEvidence(session),
          durationMinutes: session.durationMinutes,
        },
      );
    }

    if (session.longBreakMinutes > 0) {
      addAnomaly(
        session.representativeRecord,
        "long_break",
        session.longBreakMinutes > 30 ? "medium" : "low",
        "Durasi istirahat melewati alokasi",
        `Estimasi kelebihan istirahat ${session.longBreakMinutes} menit.`,
        sessionEvidence(session),
      );
    }

    if (session.missingIn) {
      addAnomaly(
        session.representativeRecord,
        "missing_shift_in",
        "high",
        "Tidak ditemukan scan masuk shift",
        "Sesi shift memiliki event, tetapi tidak ada arah IN yang bisa dipakai sebagai awal kerja.",
        sessionEvidence(session),
      );
    }

    if (session.missingOut) {
      addAnomaly(
        session.representativeRecord,
        "missing_shift_out",
        "high",
        "Tidak ditemukan scan keluar shift",
        "Sesi shift memiliki event, tetapi tidak ada arah OUT yang bisa dipakai sebagai akhir kerja.",
        sessionEvidence(session),
      );
    }
  }
}

function sessionEvidence(session) {
  return {
    person: session.person,
    workDate: session.workDate,
    shift: session.shiftLabel,
    scheduledStart: session.startTime,
    scheduledEnd: session.endTime,
    firstIn: session.firstIn?.time || "",
    lastOut: session.lastOut?.time || "",
    scans: session.scanCount,
    workExitCycles: session.workExitCycles,
    breakExitCycles: session.breakExitCycles,
  };
}

function createEmployeeReportSeed(session) {
  return {
    employeeKey: session.personKey,
    displayName: session.person || session.personKey,
    department: session.department || "",
    metrics: {
      sessions: 0,
      scanCount: 0,
      lateCount: 0,
      lateMinutes: 0,
      earlyLeaveCount: 0,
      earlyLeaveMinutes: 0,
      overtimeCount: 0,
      overtimeMinutes: 0,
      workExitCycles: 0,
      breakExitCycles: 0,
      longBreakMinutes: 0,
      missingInSessions: 0,
      missingOutSessions: 0,
      unbalancedSessions: 0,
    },
    shifts: {
      "08-16": 0,
      "16-24": 0,
      "24-08": 0,
    },
    sessions: [],
  };
}

function addSessionToEmployeeReport(report, session) {
  report.department = report.department || session.department || "";
  report.metrics.sessions += 1;
  report.metrics.scanCount += session.scanCount;
  report.metrics.lateCount += session.lateMinutes > 0 ? 1 : 0;
  report.metrics.lateMinutes += session.lateMinutes;
  report.metrics.earlyLeaveCount += session.earlyLeaveMinutes > 0 ? 1 : 0;
  report.metrics.earlyLeaveMinutes += session.earlyLeaveMinutes;
  report.metrics.overtimeCount += session.overtimeMinutes > 0 ? 1 : 0;
  report.metrics.overtimeMinutes += session.overtimeMinutes;
  report.metrics.workExitCycles += session.workExitCycles;
  report.metrics.breakExitCycles += session.breakExitCycles;
  report.metrics.longBreakMinutes += session.longBreakMinutes;
  report.metrics.missingInSessions += session.missingIn ? 1 : 0;
  report.metrics.missingOutSessions += session.missingOut ? 1 : 0;
  report.metrics.unbalancedSessions += session.inOutImbalance > 1 ? 1 : 0;
  report.shifts[session.shiftLabel] = (report.shifts[session.shiftLabel] || 0) + 1;
  report.sessions.push(toClientSession(session));
}

function finalizeEmployeeReport(report) {
  const metrics = report.metrics;
  const sessions = Math.max(metrics.sessions, 1);
  const riskScore = Math.round(
    metrics.lateCount * 4 +
      metrics.earlyLeaveCount * 5 +
      metrics.overtimeCount * 2 +
      metrics.workExitCycles * 2 +
      metrics.longBreakMinutes / 10 +
      metrics.missingInSessions * 8 +
      metrics.missingOutSessions * 8 +
      metrics.unbalancedSessions * 3,
  );

  return {
    ...report,
    metrics: {
      ...metrics,
      avgScansPerSession: round(metrics.scanCount / sessions, 2),
      avgLateMinutes: round(metrics.lateMinutes / sessions, 2),
      avgEarlyLeaveMinutes: round(metrics.earlyLeaveMinutes / sessions, 2),
      avgWorkExitCycles: round(metrics.workExitCycles / sessions, 2),
    },
    riskScore,
    riskLevel: riskScore >= 120 ? "high" : riskScore >= 55 ? "medium" : "low",
    sessions: report.sessions.slice(-45).reverse(),
  };
}

function attachEmployeeAnomalyStats(employeeReports, anomalies) {
  const byEmployee = new Map();
  for (const anomaly of anomalies) {
    const personKey = String(anomaly.person || "")
      .split(" - ")[0]
      .trim()
      .toLowerCase();
    if (!personKey) continue;
    if (!byEmployee.has(personKey)) {
      byEmployee.set(personKey, { total: 0, high: 0, medium: 0, low: 0, types: new Map() });
    }
    const stats = byEmployee.get(personKey);
    stats.total += 1;
    stats[anomaly.severity] = (stats[anomaly.severity] || 0) + 1;
    stats.types.set(anomaly.type, (stats.types.get(anomaly.type) || 0) + 1);
  }

  return employeeReports.map((employee) => {
    const stats = byEmployee.get(employee.employeeKey) || {
      total: 0,
      high: 0,
      medium: 0,
      low: 0,
      types: new Map(),
    };
    return {
      ...employee,
      anomalies: {
        total: stats.total,
        high: stats.high || 0,
        medium: stats.medium || 0,
        low: stats.low || 0,
        topTypes: topFromMap(stats.types, 5),
      },
    };
  });
}

function buildVulnerabilitySummary(employeeReports, anomalies, records) {
  const highRiskEmployees = employeeReports.filter((employee) => employee.riskLevel === "high");
  const repeatedDirection = anomalies.filter((item) => item.type === "repeated_direction").length;
  const fastTurnaround = anomalies.filter((item) => item.type === "fast_turnaround").length;
  const missingShift = anomalies.filter((item) =>
    ["missing_shift_in", "missing_shift_out"].includes(item.type),
  ).length;
  const deviceMix = topCounts(records, (record) => record.reader, 8).filter((item) =>
    String(item.name).match(/\d+\.\d+\.\d+\.\d+|office/i),
  );

  return {
    overview: {
      highRiskEmployees: highRiskEmployees.length,
      repeatedDirection,
      fastTurnaround,
      missingShift,
      deviceReadersToReview: deviceMix.length,
    },
    findings: [
      {
        type: "tailgating_or_rescan",
        title: "Scan berulang dan turnaround cepat",
        count: repeatedDirection + fastTurnaround,
        severity: repeatedDirection + fastTurnaround > 500 ? "high" : "medium",
        detail:
          "Pola ini bisa berasal dari human error, antrean scan, anti-passback yang belum ketat, atau potensi peminjaman akses.",
      },
      {
        type: "attendance_integrity",
        title: "Sesi shift tanpa IN/OUT lengkap",
        count: missingShift,
        severity: missingShift > 100 ? "high" : "medium",
        detail:
          "Sesi tanpa scan masuk/keluar lengkap mempersulit validasi jam kerja aktual dan payroll.",
      },
      {
        type: "operational_exposure",
        title: "Karyawan risiko tinggi",
        count: highRiskEmployees.length,
        severity: highRiskEmployees.length > 10 ? "high" : "medium",
        detail:
          "Risk score tinggi dihitung dari kombinasi telat, pulang cepat, lembur, scan hilang, dan keluar-masuk saat jam kerja.",
      },
    ],
  };
}

function buildShiftComplianceChart(sessions) {
  const seeds = Object.values(shiftTemplates).map((shift) => ({
    shift: shift.label,
    sessions: 0,
    late: 0,
    early: 0,
    overtime: 0,
    workExits: 0,
  }));
  const byShift = new Map(seeds.map((item) => [item.shift, item]));

  for (const session of sessions) {
    const row = byShift.get(session.shiftLabel);
    if (!row) continue;
    row.sessions += 1;
    row.late += session.lateMinutes > 0 ? 1 : 0;
    row.early += session.earlyLeaveMinutes > 0 ? 1 : 0;
    row.overtime += session.overtimeMinutes > 0 ? 1 : 0;
    row.workExits += session.workExitCycles;
  }

  return [...byShift.values()];
}

function buildHeatmap(records, anomalies) {
  const anomalyRows = new Set(anomalies.map((item) => item.rowNumber).filter(Boolean));
  const map = new Map();
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  for (const record of records) {
    if (!record.timestampMs) continue;
    const date = new Date(record.timestampMs);
    const key = `${date.getDay()}-${date.getHours()}`;
    if (!map.has(key)) {
      map.set(key, {
        dayIndex: date.getDay(),
        day: days[date.getDay()],
        hour: date.getHours(),
        label: `${days[date.getDay()]} ${String(date.getHours()).padStart(2, "0")}:00`,
        events: 0,
        anomalies: 0,
      });
    }
    const row = map.get(key);
    row.events += 1;
    if (anomalyRows.has(record.rowNumber)) row.anomalies += 1;
  }

  const rows = [...map.values()].sort((a, b) => a.dayIndex - b.dayIndex || a.hour - b.hour);
  const maxEvents = Math.max(1, ...rows.map((row) => row.events));
  return rows.map((row) => ({
    ...row,
    intensity: round(row.events / maxEvents, 4),
  }));
}

function toClientSession(session) {
  return {
    id: session.id,
    employeeKey: session.personKey,
    person: session.person,
    department: session.department,
    workDate: session.workDate,
    shift: session.shiftLabel,
    scheduledStart: session.startTime,
    scheduledEnd: session.endTime,
    firstIn: session.firstIn,
    lastOut: session.lastOut,
    scanCount: session.scanCount,
    durationMinutes: session.durationMinutes,
    lowConfidence: session.lowConfidence,
    inCount: session.inCount,
    outCount: session.outCount,
    lateMinutes: session.lateMinutes,
    earlyLeaveMinutes: session.earlyLeaveMinutes,
    overtimeMinutes: session.overtimeMinutes,
    workExitCycles: session.workExitCycles,
    breakExitCycles: session.breakExitCycles,
    longBreakMinutes: session.longBreakMinutes,
    missingIn: session.missingIn,
    missingOut: session.missingOut,
    rowNumbers: session.rowNumbers,
  };
}

function toTimePoint(record) {
  return {
    rowNumber: record.rowNumber,
    timestamp: record.timestamp,
    time: formatClock(new Date(record.timestampMs)),
  };
}

function detectCompleteness(records, schema, addAnomaly) {
  const important = [
    ["date", schema.date],
    ["time", schema.time],
    ["personnel", schema.personId || schema.firstName || schema.lastName],
    ["device", schema.device || schema.eventPoint],
  ];

  for (const record of records) {
    for (const [label, column] of important) {
      if (!column) continue;
      if (!isPresent(valueAt(record, column))) {
        addAnomaly(
          record,
          "missing_key_field",
          label === "personnel" ? "high" : "medium",
          `Kolom penting kosong: ${label}`,
          `Baris ${record.rowNumber} tidak memiliki nilai ${column}.`,
          { column, value: valueAt(record, column) },
        );
      }
    }

    if ((schema.date || schema.time) && !record.timestamp) {
      addAnomaly(
        record,
        "invalid_timestamp",
        "medium",
        "Tanggal atau waktu tidak valid",
        "Backend tidak dapat membentuk timestamp yang valid dari kolom tanggal/waktu.",
        { date: valueAt(record, schema.date), time: valueAt(record, schema.time) },
      );
    }
  }
}

function detectExactDuplicates(records, addAnomaly) {
  const groups = new Map();
  for (const record of records) {
    const signature = crypto
      .createHash("sha1")
      .update(JSON.stringify(record.values))
      .digest("hex");
    if (!groups.has(signature)) groups.set(signature, []);
    groups.get(signature).push(record);
  }

  for (const duplicates of groups.values()) {
    if (duplicates.length < 2) continue;
    for (const record of duplicates.slice(1, 12)) {
      addAnomaly(
        record,
        "exact_duplicate",
        "high",
        "Baris duplikat persis",
        `Baris ini sama persis dengan baris ${duplicates[0].rowNumber}.`,
        { firstRow: duplicates[0].rowNumber, duplicateCount: duplicates.length },
      );
    }
  }
}

function detectAccessSpecificAnomalies(records, schema, addAnomaly) {
  const groups = new Map();

  for (const record of records) {
    if (schema.selisih && isPresent(valueAt(record, schema.selisih))) {
      addAnomaly(
        record,
        "pre_existing_delta",
        "high",
        "Kolom selisih terisi",
        "File sumber sudah menandai baris ini pada kolom selisih.",
        { selisih: valueAt(record, schema.selisih) },
      );
    }

    const eventDirection = directionFromText(valueAt(record, schema.eventPoint));
    const deviceDirection = directionFromText(valueAt(record, schema.device));
    if (eventDirection && deviceDirection && eventDirection !== deviceDirection) {
      addAnomaly(
        record,
        "direction_mismatch",
        "critical",
        "Arah event dan device tidak konsisten",
        "Event Point dan Device Name menunjukkan arah yang berbeda.",
        {
          eventPoint: valueAt(record, schema.eventPoint),
          device: valueAt(record, schema.device),
        },
      );
    }

    if (record.hour !== null && (record.hour < 4 || record.hour > 23)) {
      addAnomaly(
        record,
        "off_hours_event",
        "low",
        "Event terjadi di jam tidak umum",
        "Event berada di luar rentang 04:00-23:59. Perlu dicocokkan dengan jadwal shift.",
        { hour: record.hourLabel },
      );
    }

    const key = `${record.personKey || "unknown"}::${record.dateKey || "unknown"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  for (const rows of groups.values()) {
    const sorted = rows
      .filter((row) => row.timestamp)
      .sort((a, b) => a.timestampMs - b.timestampMs);

    const directionCounts = countBy(sorted, (row) => row.direction || "Unknown");
    const inCount = directionCounts.get("IN") || 0;
    const outCount = directionCounts.get("OUT") || 0;

    if (sorted.length >= 2 && Math.abs(inCount - outCount) > 1) {
      addAnomaly(
        sorted[0],
        "unbalanced_in_out",
        "medium",
        "Jumlah In dan Out tidak seimbang",
        "Dalam satu hari, jumlah event masuk dan keluar berbeda jauh untuk personel yang sama.",
        { inCount, outCount, events: sorted.length },
      );
    }

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      const minutes = Math.abs(current.timestampMs - previous.timestampMs) / 60000;

      if (previous.direction && current.direction && previous.direction === current.direction && minutes <= 30) {
        addAnomaly(
          current,
          "repeated_direction",
          minutes <= 5 ? "high" : "medium",
          "Scan arah yang sama berulang",
          "Ada dua event berurutan dengan arah yang sama dalam window waktu pendek.",
          {
            previousRow: previous.rowNumber,
            direction: current.direction,
            gapMinutes: round(minutes, 2),
          },
        );
      }

      if (
        previous.direction &&
        current.direction &&
        previous.direction !== current.direction &&
        minutes > 0 &&
        minutes <= 2
      ) {
        addAnomaly(
          current,
          "fast_turnaround",
          "medium",
          "Perpindahan In/Out terlalu cepat",
          "Jarak antara event masuk dan keluar kurang dari atau sama dengan 2 menit.",
          {
            previousRow: previous.rowNumber,
            gapMinutes: round(minutes, 2),
          },
        );
      }
    }
  }
}

function detectDailyVolumeOutliers(records, addAnomaly) {
  const grouped = new Map();

  for (const record of records) {
    if (!record.personKey || !record.dateKey) continue;
    const key = `${record.personKey}::${record.dateKey}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }

  const counts = [...grouped.values()].map((rows) => rows.length);
  const stats = robustStats(counts);
  const threshold = Math.max(stats.median + stats.robustSigma * 4, 10);

  for (const rows of grouped.values()) {
    if (rows.length <= threshold) continue;
    const representative = rows[0];
    addAnomaly(
      representative,
      "daily_volume_outlier",
      rows.length > threshold * 1.8 ? "high" : "medium",
      "Jumlah event harian tidak wajar",
      "Jumlah scan personel pada tanggal ini jauh di atas pola mayoritas.",
      {
        eventsInDay: rows.length,
        medianEvents: round(stats.median, 2),
        threshold: round(threshold, 2),
      },
    );
  }
}

function detectNumericOutliers(records, schema, addAnomaly) {
  for (const column of schema.numericColumns || []) {
    const values = records
      .map((row) => ({ row, value: parseNumber(valueAt(row, column)) }))
      .filter((item) => Number.isFinite(item.value));

    if (values.length < 30) continue;
    const stats = robustStats(values.map((item) => item.value));
    if (stats.robustSigma <= 0) continue;

    for (const item of values) {
      const robustZ = Math.abs(item.value - stats.median) / stats.robustSigma;
      if (robustZ < 5) continue;
      addAnomaly(
        item.row,
        "numeric_outlier",
        robustZ > 9 ? "high" : "medium",
        `Outlier numerik di ${column}`,
        "Nilai numerik jauh dari pola mayoritas kolom.",
        {
          column,
          value: item.value,
          median: round(stats.median, 2),
          robustZ: round(robustZ, 2),
        },
      );
    }
  }
}

function buildLocalAiNarrative(summary, anomalies, schema) {
  const highRisk = anomalies.filter((item) => ["critical", "high"].includes(item.severity));
  const topType = summary.topAnomalyTypes[0];
  const topDept = summary.topDepartments[0];
  const mode = summary.detectedMode === "access-log" ? "log akses/absensi" : "tabel umum";

  const findings = [
    `Dataset terbaca sebagai ${mode} dengan ${formatNumber(summary.totalRows)} baris.`,
    `${formatNumber(summary.anomalyCount)} kandidat anomali terdeteksi (${(summary.anomalyRate * 100).toFixed(2)}% dari baris).`,
  ];

  if (highRisk.length) {
    findings.push(
      `${formatNumber(highRisk.length)} temuan masuk kategori high/critical dan layak diprioritaskan untuk audit manual.`,
    );
  }

  if (topType) {
    findings.push(`Tipe anomali paling sering adalah ${topType.name} (${topType.value} temuan).`);
  }

  if (topDept) {
    findings.push(`Departemen dengan volume terbesar: ${topDept.name} (${topDept.value} event).`);
  }

  if (summary.shift?.sessions) {
    findings.push(
      `Shift analytics membentuk ${formatNumber(summary.shift.sessions)} sesi: ${formatNumber(summary.shift.lateCount)} telat, ${formatNumber(summary.shift.earlyLeaveCount)} pulang cepat, dan ${formatNumber(summary.shift.overtimeCount)} lembur.`,
    );
  }

  const recommendations = [
    "Validasi baris high/critical terlebih dahulu, terutama duplikat, arah In/Out yang tidak konsisten, dan selisih yang sudah ditandai sumber.",
    "Cocokkan event off-hours dengan jadwal shift sebelum dianggap kesalahan.",
    "Gunakan export CSV anomali untuk membuat tiket koreksi atau rekonsiliasi ke sistem sumber.",
    "Prioritaskan report per karyawan dengan risk score tinggi untuk melihat pola telat, pulang cepat, lembur, dan keluar-masuk saat jam kerja.",
  ];

  if (!schema.personId) {
    recommendations.push("Tambahkan kolom identitas personel yang stabil agar analisis sequence dan duplikasi lebih kuat.");
  }

  return {
    source: "local-ai",
    model: "rules+robust-statistics",
    summary: findings.join(" "),
    findings,
    recommendations,
    generatedAt: new Date().toISOString(),
  };
}

async function enhanceWithExternalAi(analysis, options = {}) {
  const config = await loadAiConfig({ includeSecret: true });
  if (!config.enabled || !config.apiKey || config.provider === "local") {
    if (options.requireExternal) {
      const error = new Error("AI eksternal belum aktif atau API key belum tersimpan di AI Config.");
      error.status = 400;
      throw error;
    }
    return analysis;
  }

  if (config.provider === "mimo") {
    return enhanceWithMimo(analysis, config);
  }

  if (config.provider === "openai") {
    return enhanceWithOpenAiCompatible(analysis, config, "openai");
  }

  if (config.provider === "claude") {
    return enhanceWithAnthropicCompatible(analysis, config, "claude");
  }

  if (config.provider === "gemini") {
    return enhanceWithGemini(analysis, config);
  }

  return analysis;
}

async function enhanceWithMimo(analysis, config) {
  if (config.compatibility === "openai") {
    return enhanceWithOpenAiCompatible(analysis, config, "mimo-openai");
  }
  return enhanceWithAnthropicCompatible(analysis, config, "mimo-anthropic");
}

async function enhanceWithAnthropicCompatible(analysis, config, source) {
  try {
    const prompt = buildExternalAiPrompt(analysis);
    const baseUrl = normalizeBaseUrl(config.baseUrl || defaultBaseUrlFor(config.provider, config.compatibility));
    const model = config.model || defaultModelFor(config.provider, config.compatibility);

    const response = await fetch(joinApiUrl(baseUrl, "/v1/messages"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": config.anthropicVersion || "2023-06-01",
        [config.provider === "claude" ? "x-api-key" : "api-key"]: config.apiKey,
      },
      body: JSON.stringify({
        model,
        max_tokens: Number(config.maxTokens || 1600),
        system: config.prompt || defaultAiPrompt,
        messages: [
          {
            role: "user",
            content: JSON.stringify(prompt),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${source} API ${response.status}: ${body.slice(0, 500)}`);
    }

    const body = await response.json();
    const content = extractAnthropicText(body);

    if (!content) return analysis;

    return {
      ...analysis,
      ai: {
        ...analysis.ai,
        source,
        model,
        summary: content,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ...analysis,
      ai: {
        ...analysis.ai,
        externalAiError: error.message,
      },
    };
  }
}

async function enhanceWithOpenAiCompatible(analysis, config, source) {
  try {
    const baseUrl = normalizeBaseUrl(config.baseUrl || defaultBaseUrlFor(config.provider, config.compatibility));
    const model = config.model || defaultModelFor(config.provider, config.compatibility);
    const response = await fetch(joinApiUrl(baseUrl, "/v1/chat/completions"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: Number(config.maxTokens || 1600),
        messages: [
          {
            role: "system",
            content: config.prompt || defaultAiPrompt,
          },
          {
            role: "user",
            content: JSON.stringify(buildExternalAiPrompt(analysis)),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${source} API ${response.status}: ${body.slice(0, 500)}`);
    }

    const body = await response.json();
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) return analysis;

    return {
      ...analysis,
      ai: {
        ...analysis.ai,
        source,
        model,
        summary: content,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ...analysis,
      ai: {
        ...analysis.ai,
        externalAiError: error.message,
      },
    };
  }
}

async function enhanceWithGemini(analysis, config) {
  try {
    const baseUrl = normalizeBaseUrl(config.baseUrl || defaultBaseUrlFor("gemini"));
    const model = config.model || defaultModelFor("gemini");
    const response = await fetch(
      `${joinApiUrl(baseUrl, `/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: Number(config.maxTokens || 1600),
          },
          systemInstruction: {
            parts: [
              {
                text: config.prompt || defaultAiPrompt,
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: JSON.stringify(buildExternalAiPrompt(analysis)) }],
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`gemini API ${response.status}: ${body.slice(0, 500)}`);
    }

    const body = await response.json();
    const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
    if (!content) return analysis;

    return {
      ...analysis,
      ai: {
        ...analysis.ai,
        source: "gemini",
        model,
        summary: content,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      ...analysis,
      ai: {
        ...analysis.ai,
        externalAiError: error.message,
      },
    };
  }
}

function buildExternalAiPrompt(analysis) {
  return {
    summary: analysis.summary,
    shiftConfig: analysis.shiftConfig,
    vulnerability: analysis.vulnerabilitySummary,
    topEmployees: analysis.employeeReports
      .slice()
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 12)
      .map((employee) => ({
        employee: employee.displayName,
        department: employee.department,
        riskScore: employee.riskScore,
        metrics: employee.metrics,
        anomalies: employee.anomalies,
      })),
    topAnomalies: analysis.anomalies.slice(0, 30),
    algorithms: analysis.algorithms.map((item) => item.name),
  };
}

function extractAnthropicText(body) {
  return body.content
    ?.map((part) => ("text" in part ? part.text : ""))
    .join("\n")
    .trim();
}

async function loadAiConfig({ includeSecret = false } = {}) {
  try {
    const config = JSON.parse(await fs.readFile(aiConfigPath, "utf8"));
    return includeSecret ? withAiConfigDefaults(config) : publicAiConfig(config);
  } catch {
    const defaults = withAiConfigDefaults({});
    return includeSecret ? defaults : publicAiConfig(defaults);
  }
}

function withAiConfigDefaults(config) {
  const provider = String(config.provider || "local").toLowerCase();
  const compatibility = String(config.compatibility || "anthropic").toLowerCase();
  // Prefer env var for API key (security: never store in file)
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`] || "";
  return {
    enabled: Boolean(config.enabled),
    provider,
    compatibility,
    model: String(config.model || defaultModelFor(provider, compatibility)),
    baseUrl: String(config.baseUrl || defaultBaseUrlFor(provider, compatibility)),
    anthropicVersion: String(config.anthropicVersion || "2023-06-01"),
    maxTokens: Number(config.maxTokens || 1600),
    prompt: String(config.prompt || defaultAiPrompt),
    apiKey: envKey || String(config.apiKey || ""),
    updatedAt: config.updatedAt || "",
  };
}

function publicAiConfig(config) {
  const normalized = withAiConfigDefaults(config);
  return {
    enabled: normalized.enabled,
    provider: normalized.provider,
    compatibility: normalized.compatibility,
    model: normalized.model,
    baseUrl: normalized.baseUrl,
    anthropicVersion: normalized.anthropicVersion,
    maxTokens: normalized.maxTokens,
    prompt: normalized.prompt,
    apiKeyConfigured: Boolean(normalized.apiKey),
    apiKeyPreview: normalized.apiKey ? maskApiKey(normalized.apiKey) : "",
    updatedAt: normalized.updatedAt,
  };
}

function defaultModelFor(provider, compatibility = "anthropic") {
  if (provider === "mimo") return "mimo-v2.5-pro";
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "claude") return "claude-3-5-sonnet-latest";
  if (provider === "gemini") return "gemini-1.5-flash";
  return compatibility === "openai" ? "mimo-v2.5-pro" : "rules+robust-statistics";
}

function defaultBaseUrlFor(provider, compatibility = "anthropic") {
  if (provider === "mimo") {
    return compatibility === "openai"
      ? "https://api.xiaomimimo.com/openai"
      : "https://api.xiaomimimo.com/anthropic";
  }
  if (provider === "openai") return "https://api.openai.com";
  if (provider === "claude") return "https://api.anthropic.com";
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  return "";
}

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

function joinApiUrl(baseUrl, apiPath) {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  const normalizedPath = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  if (normalizedBase.endsWith("/v1") && normalizedPath.startsWith("/v1/")) {
    return `${normalizedBase}${normalizedPath.slice(3)}`;
  }
  return `${normalizedBase}${normalizedPath}`;
}

function maskApiKey(apiKey) {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "configured";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}

function findHeaderRow(matrix) {
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let index = 0; index < Math.min(matrix.length, 30); index += 1) {
    const row = matrix[index] || [];
    const cells = row.map((cell) => String(cell || "").trim()).filter(Boolean);
    const keywordScore = cells.reduce((score, cell) => {
      const text = cell.toLowerCase();
      return (
        score +
        [
          "date",
          "time",
          "event",
          "personnel",
          "name",
          "department",
          "device",
          "reader",
          "amount",
          "cost center",
        ].filter((keyword) => text.includes(keyword)).length
      );
    }, 0);
    const score = cells.length * 2 + keywordScore * 5 + new Set(cells).size;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function buildHeaders(headerCells) {
  const seen = new Map();
  return headerCells.map((cell, index) => {
    const base = String(cell || `Column ${index + 1}`).trim().replace(/\s+/g, " ");
    const fallback = base || `Column ${index + 1}`;
    const count = (seen.get(fallback) || 0) + 1;
    seen.set(fallback, count);
    return {
      label: count > 1 ? `${fallback} ${count}` : fallback,
      index,
    };
  });
}

function rowFromCells(headers, cells, rowNumber) {
  const values = {};
  for (const header of headers) {
    values[header.label] = cleanCell(cells?.[header.index]);
  }
  return { rowNumber, values };
}

function cleanCell(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value.trim();
  return value;
}

function hasUsefulCells(values) {
  return Object.values(values).some((value) => isPresent(value));
}

function inferSchema(headers, rows) {
  const labels = headers.map((header) => header.label);
  const schema = {
    date: bestColumn(labels, rows, ["date", "tanggal"], "date"),
    time: bestColumn(labels, rows, ["time", "jam"], "time"),
    personId: bestColumn(labels, rows, ["personnel id", "employee id", "nik", "id karyawan"], "id"),
    firstName: bestColumn(labels, rows, ["first name", "nama depan"], "text"),
    lastName: bestColumn(labels, rows, ["last name", "nama belakang"], "text"),
    department: bestColumn(labels, rows, ["department name", "departemen", "division"], "text"),
    departmentNumber: bestColumn(labels, rows, ["department number", "dept no"], "id"),
    costCenter: bestColumn(labels, rows, ["cost center", "costcentre"], "text"),
    device: bestColumn(labels, rows, ["device name", "device", "mesin"], "text"),
    eventPoint: bestColumn(labels, rows, ["event point", "point"], "text"),
    eventDescription: bestColumn(labels, rows, ["event description", "description", "keterangan"], "text"),
    reader: bestColumn(labels, rows, ["reader name", "reader"], "text"),
    verification: bestColumn(labels, rows, ["verification mode", "verify"], "text"),
    amount: bestColumn(labels, rows, ["amount", "debit", "credit", "total", "nominal"], "number"),
    selisih: bestColumn(labels, rows, ["selisih", "difference", "delta"], "text"),
  };

  schema.numericColumns = labels
    .filter((label) => {
      const samples = rows.slice(0, 1000).map((row) => valueAt(row, label)).filter(isPresent);
      if (samples.length < 20) return false;
      const valid = samples.filter((value) => Number.isFinite(parseNumber(value))).length;
      const lower = label.toLowerCase();
      if (
        lower.includes("date") ||
        lower.includes("time") ||
        lower.includes("id") ||
        lower.includes("number") ||
        lower.includes("center") ||
        lower.includes("selisih")
      ) {
        return false;
      }
      return valid / samples.length > 0.75;
    })
    .slice(0, 12);

  return schema;
}

function bestColumn(labels, rows, keywords, type) {
  let best = null;
  let bestScore = -Infinity;
  const sample = rows.slice(0, 1200);

  for (const label of labels) {
    const lower = label.toLowerCase();
    const keywordScore = keywords.reduce(
      (score, keyword) => score + (lower.includes(keyword) ? 20 : 0),
      0,
    );

    if (keywordScore === 0 && ["text", "id", "number"].includes(type)) continue;

    const values = sample.map((row) => valueAt(row, label)).filter(isPresent);
    if (!values.length) continue;

    let typeScore = 0;
    if (type === "date") {
      typeScore = ratio(values, (value) => Boolean(parseDateValue(value))) * 30;
    } else if (type === "time") {
      typeScore = ratio(values, (value) => Boolean(parseTimeValue(value))) * 30;
    } else if (type === "number") {
      typeScore = ratio(values, (value) => Number.isFinite(parseNumber(value))) * 30;
    } else if (type === "id") {
      typeScore = ratio(values, (value) => String(value).trim().length > 0) * 10;
    } else {
      typeScore = ratio(values, (value) => String(value).trim().length > 0) * 10;
    }

    const score = keywordScore + typeScore;
    if (score > bestScore) {
      bestScore = score;
      best = label;
    }
  }

  return bestScore > 15 ? best : null;
}

function enrichRow(row, schema) {
  const date = parseDateValue(valueAt(row, schema.date));
  const time = parseTimeValue(valueAt(row, schema.time));
  const timestamp = combineDateTime(date, time);
  const firstName = valueAt(row, schema.firstName);
  const lastName = valueAt(row, schema.lastName);
  const fallbackPerson = [firstName, lastName].filter(Boolean).join(" ").trim();
  const personId = valueAt(row, schema.personId);
  const person = [personId, fallbackPerson].filter(Boolean).join(" - ") || fallbackPerson || personId || "";
  const eventPoint = valueAt(row, schema.eventPoint);
  const device = valueAt(row, schema.device);
  const reader = valueAt(row, schema.reader);
  const direction =
    directionFromText(eventPoint) ||
    directionFromText(device) ||
    directionFromText(reader) ||
    directionFromText(valueAt(row, schema.eventDescription));
  const amount = schema.amount ? parseNumber(valueAt(row, schema.amount)) : null;

  return {
    rowNumber: row.rowNumber,
    values: row.values,
    dateKey: timestamp ? formatDate(timestamp) : date ? formatDate(date) : "",
    timestamp: timestamp ? timestamp.toISOString() : "",
    timestampMs: timestamp ? timestamp.getTime() : null,
    hour: timestamp ? timestamp.getHours() : time ? time.hour : null,
    hourLabel:
      timestamp || time
        ? `${String(timestamp ? timestamp.getHours() : time.hour).padStart(2, "0")}:00`
        : "",
    personKey: String(personId || fallbackPerson || "").trim().toLowerCase(),
    person,
    department: valueAt(row, schema.department) || valueAt(row, schema.costCenter) || "",
    device,
    eventPoint,
    reader,
    direction,
    amount: Number.isFinite(amount) ? amount : null,
    isUsable: Boolean(row.rowNumber && hasUsefulCells(row.values)),
  };
}

function parseDateValue(value) {
  if (!isPresent(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return stripTime(value);
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    let first = Number(slash[1]);
    let second = Number(slash[2]);
    let year = Number(slash[3]);
    year = year < 100 ? 2000 + year : year;
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return validDate(year, month, day);
  }

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : stripTime(fallback);
}

function parseTimeValue(value) {
  if (!isPresent(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
    };
  }
  if (typeof value === "number" && value >= 0 && value < 1) {
    const totalSeconds = Math.round(value * 24 * 60 * 60);
    return {
      hour: Math.floor(totalSeconds / 3600),
      minute: Math.floor((totalSeconds % 3600) / 60),
      second: totalSeconds % 60,
    };
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] || 0);
  const ampm = match[4]?.toUpperCase();
  if (ampm === "PM" && hour < 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

function combineDateTime(date, time) {
  if (!date) return null;
  const combined = new Date(date);
  if (time) combined.setHours(time.hour, time.minute, time.second, 0);
  return combined;
}

function validDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateAtHour(date, hour) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0, 0);
}

function formatClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function parseNumber(value) {
  if (!isPresent(value)) return NaN;
  if (typeof value === "number") return value;

  let text = String(value).trim();
  if (!text) return NaN;
  const isNegative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[()]/g, "").replace(/[^\d,.-]/g, "");
  if (!text || text === "-") return NaN;

  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    text =
      lastComma > lastDot
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if (lastComma > -1) {
    text = /^\d{1,3}(,\d{3})+$/.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return NaN;
  return isNegative && parsed > 0 ? -parsed : parsed;
}

function directionFromText(value) {
  if (!isPresent(value)) return "";
  const text = String(value).toLowerCase();
  if (/(^|[^a-z])(in|entry|masuk)([^a-z]|$)/.test(text) || text.includes("plant-in")) {
    return "IN";
  }
  if (/(^|[^a-z])(out|exit|keluar)([^a-z]|$)/.test(text) || text.includes("plant-out")) {
    return "OUT";
  }
  return "";
}

function valueAt(row, column) {
  if (!row || !column) return "";
  return row.values?.[column] ?? "";
}

function isPresent(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function ratio(values, predicate) {
  if (!values.length) return 0;
  return values.filter(predicate).length / values.length;
}

function countBy(items, selector) {
  const map = new Map();
  for (const item of items) {
    const key = selector(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function topCounts(records, selector, limit = 10) {
  return topFromMap(countBy(records, selector), limit);
}

function topFromMap(map, limit = 10) {
  return [...map.entries()]
    .filter(([name]) => isPresent(name) && name !== "Unknown")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name: String(name), value }));
}

function topSortedDate(map) {
  return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

function robustStats(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return { median: 0, mad: 0, robustSigma: 0 };
  const med = median(sorted);
  const deviations = sorted.map((value) => Math.abs(value - med)).sort((a, b) => a - b);
  const mad = median(deviations);
  return {
    median: med,
    mad,
    robustSigma: mad ? mad * 1.4826 : Math.max(1, med * 0.1),
  };
}

function median(sortedValues) {
  if (!sortedValues.length) return 0;
  const middle = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2) return sortedValues[middle];
  return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

function formatDate(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatNumber(value) {
  return new Intl.NumberFormat("id-ID").format(value || 0);
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function toClientRecord(record) {
  return {
    rowNumber: record.rowNumber,
    date: record.dateKey,
    timestamp: record.timestamp,
    person: record.person,
    department: record.department,
    device: record.device,
    eventPoint: record.eventPoint,
    direction: record.direction,
    values: record.values,
  };
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return lines.join("\n");
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function createDatasetId(originalName) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const hash = crypto.randomBytes(4).toString("hex");
  const slug = sanitizeFileName(originalName).replace(/\.[^.]+$/, "").slice(0, 36);
  return `${stamp}-${slug}-${hash}`;
}

function sanitizeFileName(name) {
  const withoutControlChars = [...String(name || "dataset")]
    .map((char) => (char.charCodeAt(0) < 32 ? "-" : char))
    .join("");
  return withoutControlChars
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function redactDatasetListItem(analysis) {
  return {
    id: analysis.metadata.id,
    originalName: analysis.metadata.originalName,
    createdAt: analysis.metadata.createdAt,
    selectedSheet: analysis.metadata.selectedSheet,
    summary: analysis.summary,
  };
}

function redactInternalPaths(analysis) {
  const cloned = structuredClone(analysis);
  if (cloned.metadata) {
    delete cloned.metadata.recordsPath;
    delete cloned.metadata.storedFilePath;
  }
  return cloned;
}

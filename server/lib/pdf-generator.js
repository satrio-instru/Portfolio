import puppeteer from "puppeteer";
import { formatNumber } from "./pipeline.js";

function formatDate(date) {
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimestamp() {
  return new Date().toLocaleString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function buildReportParagraph(employee, analysis) {
  const name = employee.displayName || "-";
  const dept = employee.department || "-";
  const riskLevel = employee.riskLevel || "-";
  const riskScore = employee.riskScore || 0;
  const metrics = employee.metrics || {};
  const summary = analysis.summary || {};
  const anomalyCount = employee.anomalies?.total || 0;

  const findings = [];
  if (metrics.lateCount > 0) findings.push(`${metrics.lateCount} kali terlambat`);
  if (metrics.earlyLeaveCount > 0) findings.push(`${metrics.earlyLeaveCount} kali pulang cepat`);
  if (metrics.overtimeCount > 0) findings.push(`${metrics.overtimeCount} sesi lembur`);
  if (metrics.workExitCycles > 0) findings.push(`${metrics.workExitCycles} siklus keluar saat jam kerja`);
  if (anomalyCount > 0) findings.push(`${anomalyCount} anomali terdeteksi`);

  const findingsText = findings.length > 0
    ? findings.join(", ")
    : "tidak ditemukan temuan signifikan";

  return `Berdasarkan hasil analisis yang dilakukan melalui VATh (Verification Analytical Tools Helper), data employee atas nama ${name} dari departemen ${dept} menunjukkan bahwa kategori risiko karyawan adalah ${riskLevel} dengan skor ${riskScore}. Temuan utama dari proses verifikasi dan analisis adalah ${findingsText}. Dari total ${formatNumber(summary.totalRows || 0)} baris data dan ${formatNumber(summary.distinctPeople || 0)} personel unik yang dianalisa, hasil ini dapat digunakan sebagai bahan evaluasi, dokumentasi, dan pengambilan keputusan lebih lanjut sesuai kebutuhan operasional.`;
}

function buildEmployeeReportHtml(employee, analysis, datasetId) {
  const metrics = employee.metrics || {};
  const sessions = employee.sessions || [];
  const anomalies = employee.anomalies || {};
  const summary = analysis.summary || {};
  const paragraph = buildReportParagraph(employee, analysis);
  const timestamp = formatTimestamp();

  const sessionRows = sessions.slice(0, 50).map((s) => `
    <tr>
      <td>${s.workDate || "-"}</td>
      <td>${s.shift || "-"}</td>
      <td>${s.firstIn?.time || "-"}</td>
      <td>${s.lastOut?.time || "-"}</td>
      <td>${s.lateMinutes || 0}</td>
      <td>${s.earlyLeaveMinutes || 0}</td>
      <td>${s.overtimeMinutes || 0}</td>
      <td>${s.workExitCycles || 0}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #1a1a2e;
    line-height: 1.6;
    padding: 48px;
    background: #fff;
  }
  .header {
    text-align: center;
    border-bottom: 3px solid #36d1dc;
    padding-bottom: 24px;
    margin-bottom: 32px;
  }
  .header h1 {
    font-size: 28px;
    color: #07101f;
    letter-spacing: 2px;
  }
  .header .subtitle {
    font-size: 14px;
    color: #6b7280;
    margin-top: 4px;
  }
  .section-title {
    font-size: 16px;
    font-weight: 700;
    color: #36d1dc;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 8px;
    margin: 24px 0 16px;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
  }
  .info-item {
    padding: 12px 16px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }
  .info-item .label {
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .info-item .value {
    font-size: 18px;
    font-weight: 700;
    color: #07101f;
    margin-top: 4px;
  }
  .info-item.high .value { color: #ef4444; }
  .info-item.medium .value { color: #f59e0b; }
  .info-item.low .value { color: #22c55e; }
  .paragraph {
    font-size: 13px;
    color: #374151;
    line-height: 1.8;
    margin-bottom: 24px;
    text-align: justify;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    margin-bottom: 24px;
  }
  th {
    background: #07101f;
    color: #fff;
    padding: 10px 8px;
    text-align: left;
    font-weight: 600;
  }
  td {
    padding: 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  tr:nth-child(even) { background: #f8fafc; }
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 2px solid #e5e7eb;
    text-align: center;
    font-size: 11px;
    color: #9ca3af;
  }
  .risk-badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
  }
  .risk-badge.high { background: #ef4444; }
  .risk-badge.medium { background: #f59e0b; }
  .risk-badge.low { background: #22c55e; }
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 24px;
  }
  .metric-box {
    text-align: center;
    padding: 14px 8px;
    background: #f0f9ff;
    border-radius: 8px;
    border: 1px solid #bae6fd;
  }
  .metric-box .label { font-size: 10px; color: #6b7280; font-weight: 600; }
  .metric-box .value { font-size: 20px; font-weight: 700; color: #07101f; }
</style>
</head>
<body>
  <div class="header">
    <h1>VATh</h1>
    <div class="subtitle">Verification Analytical Tools Helper — Employee Report</div>
  </div>

  <div class="info-grid">
    <div class="info-item">
      <div class="label">Nama Employee</div>
      <div class="value">${employee.displayName || "-"}</div>
    </div>
    <div class="info-item">
      <div class="label">Employee Key</div>
      <div class="value">${employee.employeeKey || "-"}</div>
    </div>
    <div class="info-item">
      <div class="label">Departemen</div>
      <div class="value">${employee.department || "-"}</div>
    </div>
    <div class="info-item ${employee.riskLevel}">
      <div class="label">Risk Level</div>
      <div class="value"><span class="risk-badge ${employee.riskLevel}">${employee.riskLevel?.toUpperCase()} (${employee.riskScore})</span></div>
    </div>
  </div>

  <div class="section-title">Ringkasan Metrik</div>
  <div class="metrics-grid">
    <div class="metric-box">
      <div class="label">Sesi</div>
      <div class="value">${metrics.sessions || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Telat</div>
      <div class="value">${metrics.lateCount || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Pulang Cepat</div>
      <div class="value">${metrics.earlyLeaveCount || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Lembur</div>
      <div class="value">${metrics.overtimeCount || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Keluar Kerja</div>
      <div class="value">${metrics.workExitCycles || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Keluar Istirahat</div>
      <div class="value">${metrics.breakExitCycles || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Scan/Session</div>
      <div class="value">${metrics.avgScansPerSession || 0}</div>
    </div>
    <div class="metric-box">
      <div class="label">Anomali</div>
      <div class="value">${anomalies.total || 0}</div>
    </div>
  </div>

  <div class="section-title">Paragraf Analisis</div>
  <p class="paragraph">${paragraph}</p>

  <div class="section-title">Riwayat Shift (maks. 50 sesi)</div>
  <table>
    <thead>
      <tr>
        <th>Tanggal</th>
        <th>Shift</th>
        <th>First IN</th>
        <th>Last OUT</th>
        <th>Telat (mnt)</th>
        <th>Pulang Cepat (mnt)</th>
        <th>Lembur (mnt)</th>
        <th>Keluar Kerja</th>
      </tr>
    </thead>
    <tbody>
      ${sessionRows}
    </tbody>
  </table>

  <div class="footer">
    <p><strong>VATh — Verification Analytical Tools Helper</strong></p>
    <p>Report generated: ${timestamp}</p>
    <p>Dataset ID: ${datasetId}</p>
  </div>
</body>
</html>`;
}

export async function generateEmployeePdf({ employee, analysis, datasetId }) {
  const html = buildEmployeeReportHtml(employee, analysis, datasetId);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "16mm", right: "16mm" },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

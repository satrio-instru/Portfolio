import puppeteer from "puppeteer";
import chromium from "@sparticuz/chromium";

function formatNumber(n) {
  if (n == null) return "0";
  return Number(n).toLocaleString("id-ID");
}

function severityColor(severity) {
  const colors = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#65a30d", info: "#0ea5e9" };
  return colors[severity] || "#6b7280";
}

function htmlShell(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1e293b; line-height: 1.6; padding: 40px; }
  .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; padding: 32px; border-radius: 12px; margin-bottom: 32px; }
  .header h1 { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .header p { font-size: 13px; opacity: 0.8; }
  .section { margin-bottom: 28px; }
  .section-title { font-size: 16px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 16px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }
  .kpi-value { font-size: 22px; font-weight: 700; color: #0f172a; }
  .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: white; }
  .badge-critical { background: #dc2626; } .badge-high { background: #ea580c; }
  .badge-medium { background: #d97706; } .badge-low { background: #65a30d; }
  .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
  .ai-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; font-size: 13px; }
  .ai-box h4 { color: #1d4ed8; margin-bottom: 8px; }
  .footer { text-align: center; color: #94a3b8; font-size: 11px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .risk-bar { height: 8px; border-radius: 4px; background: #e2e8f0; margin-top: 4px; }
  .risk-fill { height: 100%; border-radius: 4px; }
  ul { padding-left: 20px; } li { margin-bottom: 4px; font-size: 13px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .info-item { padding: 12px 16px; background: #f8fafc; border-radius: 8px; border: 1px solid #e5e7eb; }
  .info-item .label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; }
  .info-item .value { font-size: 18px; font-weight: 700; color: #07101f; margin-top: 4px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
  .metric-box { text-align: center; padding: 14px 8px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd; }
  .metric-box .label { font-size: 10px; color: #6b7280; font-weight: 600; }
  .metric-box .value { font-size: 20px; font-weight: 700; color: #07101f; }
  .paragraph { font-size: 13px; color: #374151; line-height: 1.8; margin-bottom: 24px; text-align: justify; }
</style>
</head><body>
${body}
<div class="footer">VATh — Verification Analytical Tools Helper · Generated ${new Date().toLocaleString("id-ID")}</div>
</body></html>`;
}

function summaryKpis(s) {
  return `<div class="kpi-grid">
    <div class="kpi"><div class="kpi-value">${formatNumber(s.totalRows)}</div><div class="kpi-label">Total Baris</div></div>
    <div class="kpi"><div class="kpi-value">${formatNumber(s.distinctPeople)}</div><div class="kpi-label">Personel</div></div>
    <div class="kpi"><div class="kpi-value">${formatNumber(s.anomalyCount)}</div><div class="kpi-label">Anomali</div></div>
    <div class="kpi"><div class="kpi-value">${(s.anomalyRate * 100).toFixed(1)}%</div><div class="kpi-label">Rasio</div></div>
    <div class="kpi"><div class="kpi-value">${formatNumber(s.shift?.lateCount)}</div><div class="kpi-label">Telat</div></div>
    <div class="kpi"><div class="kpi-value">${formatNumber(s.shift?.earlyLeaveCount)}</div><div class="kpi-label">Pulang Cepat</div></div>
    <div class="kpi"><div class="kpi-value">${formatNumber(s.shift?.overtimeCount)}</div><div class="kpi-label">Lembur</div></div>
    <div class="kpi"><div class="kpi-value">${formatNumber(s.shift?.workExitCycles)}</div><div class="kpi-label">Keluar Kerja</div></div>
  </div>`;
}

export async function generateEmployeePdf({ employee, analysis, records }) {
  const metrics = employee.metrics || {};
  const anomalies = employee.anomalies || {};
  const sessions = employee.sessions || [];

  const html = htmlShell(`Report: ${employee.displayName}`, `
    <div class="header"><h1>📊 Report Karyawan</h1><p>${employee.displayName} (${employee.employeeKey}) · ${employee.department}</p></div>
    <div class="info-grid">
      <div class="info-item"><div class="label">Nama</div><div class="value">${employee.displayName}</div></div>
      <div class="info-item"><div class="label">Departemen</div><div class="value">${employee.department || "-"}</div></div>
      <div class="info-item"><div class="label">Risk Score</div><div class="value">${employee.riskScore}</div></div>
      <div class="info-item"><div class="label">Anomali</div><div class="value">${anomalies.total || employee.anomalyCount || 0}</div></div>
    </div>
    <div class="section">
      <div class="section-title">Metrik Shift</div>
      <div class="metrics-grid">
        <div class="metric-box"><div class="label">Sesi</div><div class="value">${metrics.sessions || 0}</div></div>
        <div class="metric-box"><div class="label">Telat</div><div class="value">${metrics.lateCount || 0}</div></div>
        <div class="metric-box"><div class="label">Pulang Cepat</div><div class="value">${metrics.earlyLeaveCount || 0}</div></div>
        <div class="metric-box"><div class="label">Lembur</div><div class="value">${metrics.overtimeCount || 0}</div></div>
        <div class="metric-box"><div class="label">Keluar Kerja</div><div class="value">${metrics.workExitCycles || 0}</div></div>
        <div class="metric-box"><div class="label">Keluar Istirahat</div><div class="value">${metrics.breakExitCycles || 0}</div></div>
        <div class="metric-box"><div class="label">Anomali</div><div class="value">${anomalies.total || 0}</div></div>
        <div class="metric-box"><div class="label">Records</div><div class="value">${formatNumber(records?.length || 0)}</div></div>
      </div>
    </div>
    ${sessions.length ? `
    <div class="section">
      <div class="section-title">Riwayat Shift (maks 50)</div>
      <table><tr><th>Tanggal</th><th>Shift</th><th>IN</th><th>OUT</th><th>Telat</th><th>P.Cepat</th><th>Lembur</th><th>Keluar</th></tr>
        ${sessions.slice(0, 50).map(s => `<tr><td>${s.workDate||"-"}</td><td>${s.shift||"-"}</td><td>${s.firstIn?.time||"-"}</td><td>${s.lastOut?.time||"-"}</td><td>${s.lateMinutes||0}</td><td>${s.earlyLeaveMinutes||0}</td><td>${s.overtimeMinutes||0}</td><td>${s.workExitCycles||0}</td></tr>`).join("")}
      </table>
    </div>` : ""}
    ${analysis?.ai?.summary ? `<div class="section"><div class="section-title">AI Insight</div><div class="ai-box"><p>${analysis.ai.summary}</p></div></div>` : ""}
  `);
  return htmlToPdf(html);
}

export async function generateDatasetPdf(dataset) {
  const s = dataset.summary || {};
  const anomalies = dataset.anomalies || [];
  const employees = dataset.employeeReports || [];

  const html = htmlShell(`Report: ${dataset.metadata?.originalName}`, `
    <div class="header"><h1>📋 Report Dataset</h1><p>${dataset.metadata?.originalName} · ${formatNumber(s.totalRows)} baris</p></div>
    <div class="section"><div class="section-title">KPI</div>${summaryKpis(s)}</div>
    <div class="section"><div class="two-col">
      <div><div class="section-title">Severity</div>
        ${["critical","high","medium","low"].map(sev=>`<div class="card"><strong>${sev}</strong>: ${formatNumber(s.severity?.[sev]||0)}</div>`).join("")}
      </div>
      <div><div class="section-title">Shift</div>
        ${["lateCount","earlyLeaveCount","overtimeCount","workExitCycles"].map(k=>`<div class="card"><strong>${k}</strong>: ${formatNumber(s.shift?.[k])}</div>`).join("")}
      </div>
    </div></div>
    ${anomalies.length?`<div class="section"><div class="section-title">Top Anomali</div><table><tr><th>#</th><th>Tipe</th><th>Severity</th><th>Deskripsi</th></tr>
      ${anomalies.slice(0,15).map((a,i)=>`<tr><td>${i+1}</td><td>${a.type||"-"}</td><td><span class="badge badge-${a.severity||"low"}">${a.severity||"-"}</span></td><td>${a.description||"-"}</td></tr>`).join("")}
    </table></div>`:""}
    ${employees.length?`<div class="section"><div class="section-title">Top Risk Employees</div><table><tr><th>Nama</th><th>Dept</th><th>Risk</th><th>Anomali</th></tr>
      ${employees.slice(0,15).map(e=>`<tr><td>${e.displayName}</td><td>${e.department}</td><td><strong>${e.riskScore}</strong></td><td>${e.anomalyCount}</td></tr>`).join("")}
    </table></div>`:""}
    ${dataset.ai?.summary?`<div class="section"><div class="section-title">AI Analysis</div><div class="ai-box"><p>${dataset.ai.summary}</p></div></div>`:""}
  `);
  return htmlToPdf(html);
}

export async function generateVisualizationPdf(dataset) {
  const s = dataset.summary || {};
  const charts = dataset.charts || {};

  const html = htmlShell(`Visualisasi: ${dataset.metadata?.originalName}`, `
    <div class="header"><h1>📈 Dashboard Visualisasi</h1><p>${dataset.metadata?.originalName}</p></div>
    <div class="section"><div class="section-title">KPI</div>${summaryKpis(s)}</div>
    <div class="section"><div class="section-title">Daily Trend</div><table><tr><th>Tanggal</th><th>Events</th><th>Anomali</th><th>Bar</th></tr>
      ${(charts.dailyEvents||[]).slice(-14).map(d=>{const max=Math.max(1,...(charts.dailyEvents||[]).map(x=>x.events));return`<tr><td>${d.date}</td><td>${d.events}</td><td>${d.anomalies}</td><td><div class="risk-bar"><div class="risk-fill" style="width:${(d.events/max*100).toFixed(0)}%;background:#3b82f6"></div></div></td></tr>`;}).join("")}
    </table></div>
    <div class="section"><div class="section-title">Hourly Distribution</div><table><tr><th>Jam</th><th>Events</th><th>Bar</th></tr>
      ${(charts.hourlyDistribution||[]).map(h=>{const max=Math.max(1,...(charts.hourlyDistribution||[]).map(x=>x.events));return`<tr><td>${h.hour}</td><td>${h.events}</td><td><div class="risk-bar"><div class="risk-fill" style="width:${(h.events/max*100).toFixed(0)}%;background:#8b5cf6"></div></div></td></tr>`;}).join("")}
    </table></div>
    <div class="section"><div class="two-col">
      <div><div class="section-title">Shift Compliance</div>${(charts.shiftCompliance||[]).map(sc=>`<div class="card"><strong>Shift ${sc.shift}</strong>: Sessions ${sc.sessions}, Late ${sc.late}, Early ${sc.early}, OT ${sc.overtime}</div>`).join("")}</div>
      <div><div class="section-title">Vulnerability</div>${(dataset.vulnerabilitySummary?.findings||[]).map(f=>`<div class="card"><strong>${f.title}</strong><br><span class="badge badge-${f.severity}">${f.severity}</span> ${f.count} temuan</div>`).join("")}</div>
    </div></div>
    ${dataset.ai?.summary?`<div class="section"><div class="section-title">AI Insight</div><div class="ai-box"><p>${dataset.ai.summary}</p></div></div>`:""}
  `);
  return htmlToPdf(html);
}

async function htmlToPdf(html) {
  const browser = await puppeteer.launch({
    headless: chromium.headless,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "16mm", right: "12mm", bottom: "16mm", left: "12mm" } });
  } finally {
    await browser.close();
  }
}

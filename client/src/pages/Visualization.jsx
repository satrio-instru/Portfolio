import { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Treemap, Sankey,
} from "recharts";
import { formatNumber } from "../utils/format";

const COLORS = ["#60a5fa", "#f87171", "#fbbf24", "#4ade80", "#a78bfa", "#f472b6", "#22d3ee", "#fb923c", "#2dd4bf", "#818cf8"];
const SEVERITY_COLORS = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#84cc16", info: "#38bdf8" };

function ChartCard({ title, children, span = 1 }) {
  return (
    <div className={`chart-card span-${span}`}>
      <h4>{title}</h4>
      <div className="chart-body">{children}</div>
    </div>
  );
}

export default function VisualizationPage({ dataset, onExportPdf }) {
  const [tab, setTab] = useState("overview");
  const charts = dataset?.charts || {};
  const summary = dataset?.summary || {};
  const employees = dataset?.employeeReports || [];
  const anomalies = dataset?.anomalies || [];
  const vuln = dataset?.vulnerabilitySummary || {};

  // ── Data derivations ───────────────────────────────────────
  const severityData = useMemo(() =>
    ["critical", "high", "medium", "low"].map(s => ({
      name: s, value: summary.severity?.[s] || 0, fill: SEVERITY_COLORS[s],
    })), [summary]);

  const shiftData = useMemo(() => (charts.shiftCompliance || []).map(s => ({
    ...s, fill: "#3b82f6",
  })), [charts]);

  const hourlyData = useMemo(() => (charts.hourlyDistribution || []), [charts]);

  const dailyData = useMemo(() => (charts.dailyEvents || []).slice(-30), [charts]);

  const anomalyTypeData = useMemo(() => {
    const counts = {};
    anomalies.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [anomalies]);

  const departmentData = useMemo(() => {
    const counts = {};
    employees.forEach(e => {
      const dept = e.department || "Unknown";
      if (!counts[dept]) counts[dept] = { dept, count: 0, riskSum: 0, anomalies: 0 };
      counts[dept].count++;
      counts[dept].riskSum += e.riskScore || 0;
      counts[dept].anomalies += e.anomalyCount || 0;
    });
    return Object.values(counts).map(d => ({ ...d, avgRisk: Math.round(d.riskSum / d.count) })).sort((a, b) => b.avgRisk - a.avgRisk);
  }, [employees]);

  const riskDistribution = useMemo(() => {
    const buckets = { "0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0 };
    employees.forEach(e => {
      const r = e.riskScore || 0;
      if (r <= 20) buckets["0-20"]++;
      else if (r <= 40) buckets["21-40"]++;
      else if (r <= 60) buckets["41-60"]++;
      else if (r <= 80) buckets["61-80"]++;
      else buckets["81-100"]++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [employees]);

  const topEmployees = useMemo(() => [...employees].sort((a, b) => b.riskScore - a.riskScore).slice(0, 10), [employees]);

  const heatmapData = useMemo(() => {
    const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    const result = [];
    days.forEach((day, di) => {
      for (let h = 0; h < 24; h++) {
        const entry = (charts.heatmap || []).find(e => e.dayIndex === di && e.hour === h);
        result.push({ day, hour: `${h}:00`, events: entry?.events || 0, anomalies: entry?.anomalies || 0 });
      }
    });
    return result;
  }, [charts]);

  const vulnerabilityData = useMemo(() =>
    (vuln.findings || []).map(f => ({ name: f.title, count: f.count, severity: f.severity })), [vuln]);

  const weekdayData = useMemo(() => {
    const days = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    return days.map((day, i) => {
      const entries = (charts.heatmap || []).filter(e => e.dayIndex === i);
      return { day, events: entries.reduce((s, e) => s + e.events, 0), anomalies: entries.reduce((s, e) => s + e.anomalies, 0) };
    });
  }, [charts]);

  const radarData = useMemo(() => {
    const s = summary.shift || {};
    return [
      { subject: "Telat", value: s.lateCount || 0 },
      { subject: "Pulang Cepat", value: s.earlyLeaveCount || 0 },
      { subject: "Lembur", value: s.overtimeCount || 0 },
      { subject: "Keluar Kerja", value: s.workExitCycles || 0 },
      { subject: "Keluar Istirahat", value: s.breakExitCycles || 0 },
      { subject: "Anomali", value: summary.anomalyCount || 0 },
    ];
  }, [summary]);

  const employeeScatterData = useMemo(() =>
    employees.map(e => ({ name: e.displayName, risk: e.riskScore || 0, anomalies: e.anomalyCount || 0, dept: e.department })), [employees]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "time", label: "Waktu" },
    { id: "shift", label: "Shift" },
    { id: "people", label: "Personel" },
    { id: "anomaly", label: "Anomali" },
    { id: "vuln", label: "Vulnerability" },
    { id: "ai", label: "AI Insight" },
  ];

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Visualisasi</p>
          <h2>Dashboard Analisa Data</h2>
        </div>
        <button className="upload-button" onClick={onExportPdf}>Export PDF</button>
      </section>

      <div className="viz-tabs">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="chart-grid">
        {tab === "overview" && (
          <>
            <ChartCard title="1. Daily Event Trend" span={2}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis tick={{ fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Area type="monotone" dataKey="events" stroke="#60a5fa" fill="#60a5fa40" strokeWidth={2} />
                  <Area type="monotone" dataKey="anomalies" stroke="#f87171" fill="#f8717130" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="2. Severity Distribution">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {severityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="3. Hourly Distribution">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="events" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="4. Shift Compliance">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={shiftData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shift" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                  <Bar dataKey="late" fill="#ef4444" name="Telat" />
                  <Bar dataKey="early" fill="#f59e0b" name="Pulang Cepat" />
                  <Bar dataKey="overtime" fill="#22c55e" name="Lembur" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="5. KPI Summary" span={2}>
              <div className="kpi-grid-viz">
                {[
                  ["Total Baris", summary.totalRows],
                  ["Personel", summary.distinctPeople],
                  ["Anomali", summary.anomalyCount],
                  ["Rasio", `${(summary.anomalyRate * 100).toFixed(1)}%`],
                  ["Telat", summary.shift?.lateCount],
                  ["Pulang Cepat", summary.shift?.earlyLeaveCount],
                  ["Lembur", summary.shift?.overtimeCount],
                  ["Keluar Kerja", summary.shift?.workExitCycles],
                ].map(([label, val]) => (
                  <div key={label} className="kpi-viz">
                    <span>{label}</span>
                    <strong>{formatNumber(val)}</strong>
                  </div>
                ))}
              </div>
            </ChartCard>
          </>
        )}

        {tab === "time" && (
          <>
            <ChartCard title="6. Daily Events (Line)" span={2}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Line type="monotone" dataKey="events" stroke="#3b82f6" strokeWidth={2} />
                  <Line type="monotone" dataKey="anomalies" stroke="#ef4444" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="7. Hourly Area">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Area type="monotone" dataKey="events" stroke="#06b6d4" fill="#06b6d440" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="8. Weekday Distribution">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={weekdayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="day" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                  <Bar dataKey="events" fill="#3b82f6" name="Events" />
                  <Bar dataKey="anomalies" fill="#ef4444" name="Anomali" />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="9. Daily Anomaly Rate" span={2}>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="events" fill="#3b82f680" name="Events" />
                  <Line type="monotone" dataKey="anomalies" stroke="#ef4444" strokeWidth={2} name="Anomali" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="10. Event Intensity Heatmap (Table)">
              <div className="heatmap-table">
                <table>
                  <thead><tr><th></th>{Array.from({length:24},(_,i)=><th key={i}>{i}</th>)}</tr></thead>
                  <tbody>
                    {["Sen","Sel","Rab","Kam","Jum","Sab","Min"].map((day,di)=>(
                      <tr key={di}><td>{day}</td>
                        {Array.from({length:24},(_,h)=>{
                          const entry=heatmapData.find(e=>e.day===day&&e.hour===`${h}:00`);
                          const intensity=Math.min(1,(entry?.events||0)/Math.max(1,...heatmapData.map(e=>e.events)));
                          return <td key={h} style={{background:`rgba(59,130,246,${intensity})`,width:16,height:16}} title={`${day} ${h}:00 - ${entry?.events||0} events`}/>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </>
        )}

        {tab === "shift" && (
          <>
            <ChartCard title="11. Shift Sessions">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={shiftData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shift" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="sessions" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="12. Late vs Early Leave">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={shiftData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shift" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                  <Bar dataKey="late" fill="#ef4444" name="Telat" />
                  <Line type="monotone" dataKey="early" stroke="#f59e0b" name="Pulang Cepat" />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="13. Overtime by Shift">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={shiftData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shift" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Area type="monotone" dataKey="overtime" stroke="#22c55e" fill="#22c55e40" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="14. Work Exits by Shift">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={shiftData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="shift" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="workExits" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="15. Shift Radar" span={2}>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis />
                  <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f640" />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        {tab === "people" && (
          <>
            <ChartCard title="16. Top 10 Risk Employees" span={2}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={topEmployees} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" /><YAxis type="category" dataKey="displayName" width={100} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="riskScore" fill="#ef4444" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="17. Risk Distribution">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={riskDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {riskDistribution.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="18. Department Avg Risk">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={departmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="dept" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="avgRisk" fill="#8b5cf6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="19. Department Anomaly Count">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={departmentData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="dept" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="anomalies" fill="#ec4899" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="20. Risk vs Anomalies (Scatter)" span={2}>
              <ResponsiveContainer width="100%" height={300}>
                <ScatterChart>
                  <CartesianGrid /><XAxis dataKey="risk" name="Risk" /><YAxis dataKey="anomalies" name="Anomali" />
                  <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                  <Scatter data={employeeScatterData} fill="#3b82f6" />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="21. Employee Count by Department">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={departmentData} dataKey="count" nameKey="dept" cx="50%" cy="50%" outerRadius={90} label>
                    {departmentData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        {tab === "anomaly" && (
          <>
            <ChartCard title="22. Anomaly Types">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={anomalyTypeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" /><YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="value" fill="#ef4444" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="23. Anomaly Type Pie">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={anomalyTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {anomalyTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="24. Severity Bar">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={severityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="value" radius={[4,4,0,0]}>
                    {severityData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="25. Daily Anomalies Trend">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Area type="monotone" dataKey="anomalies" stroke="#ef4444" fill="#ef444440" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="26. Anomaly Rate Over Time" span={2}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyData.map(d => ({ ...d, rate: d.events > 0 ? (d.anomalies / d.events * 100).toFixed(1) : 0 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis unit="%" /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Line type="monotone" dataKey="rate" stroke="#f59e0b" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        {tab === "vuln" && (
          <>
            <ChartCard title="27. Vulnerability Findings">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vulnerabilityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="count" fill="#f97316" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="28. Vulnerability Severity">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={vulnerabilityData.map(v => ({ ...v, fill: SEVERITY_COLORS[v.severity] || "#6b7280" }))} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                    {vulnerabilityData.map((v, i) => <Cell key={i} fill={SEVERITY_COLORS[v.severity] || COLORS[i]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} /><Legend wrapperStyle={{ color: "#94a3b8" }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="29. Risk Overview Radar" span={2}>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={[
                  { subject: "High Risk Employees", value: vuln.overview?.highRiskEmployees || 0 },
                  { subject: "Repeated Direction", value: vuln.overview?.repeatedDirection || 0 },
                  { subject: "Fast Turnaround", value: vuln.overview?.fastTurnaround || 0 },
                  { subject: "Missing Shift", value: vuln.overview?.missingShift || 0 },
                  { subject: "Device Readers", value: vuln.overview?.deviceReadersToReview || 0 },
                ]}>
                  <PolarGrid /><PolarAngleAxis dataKey="subject" /><PolarRadiusAxis />
                  <Radar dataKey="value" stroke="#f97316" fill="#f9731640" />
                </RadarChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        {tab === "ai" && (
          <>
            <ChartCard title="30. AI Summary" span={2}>
              <div className="ai-content">
                <h4>Source: {dataset?.ai?.source || "local"} · Model: {dataset?.ai?.model || "-"}</h4>
                <p>{dataset?.ai?.summary || "Belum ada analisa AI."}</p>
                {dataset?.ai?.recommendations?.length > 0 && (
                  <ul>{dataset.ai.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                )}
                {dataset?.ai?.externalAiError && <p className="error-text">Error: {dataset.ai.externalAiError}</p>}
              </div>
            </ChartCard>

            <ChartCard title="31. Top Anomaly Types (AI Context)">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={anomalyTypeData.slice(0, 5)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} /><YAxis /><Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#e2e8f0" }} />
                  <Bar dataKey="value" fill="#6366f1" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}
      </div>
    </>
  );
}

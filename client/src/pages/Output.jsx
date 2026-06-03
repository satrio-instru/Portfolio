import { useState, useMemo, useEffect } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";
import { BarChart3, Clock, Database, Download, PieChart as PieIcon, ShieldAlert } from "lucide-react";
import { formatNumber, truncate } from "../utils/format";
import { palette } from "../config/palette";
import { API_BASE } from "../config/api";

export default function OutputPage({ dataset }) {
  const dailyEvents = useMemo(() => dataset.charts.dailyEvents || [], [dataset.charts.dailyEvents]);
  const eventThresholdDefault = useMemo(() => {
    const values = dailyEvents.map((item) => Number(item.events) || 0).filter(Boolean);
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }, [dailyEvents]);
  const [eventThreshold, setEventThreshold] = useState(eventThresholdDefault);
  const thresholdHits = useMemo(
    () => dailyEvents.filter((item) => Number(item.events) >= eventThreshold).length,
    [dailyEvents, eventThreshold],
  );

  useEffect(() => {
    setEventThreshold(eventThresholdDefault);
  }, [dataset.metadata.id, eventThresholdDefault]);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Output charts</p>
          <h2>Visualisasi volume, risiko, shift, dan vulnerability.</h2>
        </div>
        <div className="threshold-panel">
          <label>
            <span>Events threshold</span>
            <input
              type="number"
              min="0"
              value={eventThreshold}
              onChange={(event) => setEventThreshold(Math.max(0, Number(event.target.value) || 0))}
            />
          </label>
          <strong>{formatNumber(thresholdHits)} hari melewati batas</strong>
        </div>
      </section>
      <section className="charts-grid">
        <ChartPanel title="Volume harian" icon={<BarChart3 size={18} />}>
          <DailyEventsChart data={dailyEvents} threshold={eventThreshold} />
        </ChartPanel>
        <ChartPanel title="Distribusi jam" icon={<BarChart3 size={18} />}>
          <HourlyChart data={dataset.charts.hourlyDistribution || []} threshold={eventThreshold} />
        </ChartPanel>
        <ChartPanel title="Severity pie" icon={<PieIcon size={18} />}>
          <PieBreakdown data={dataset.charts.anomalySeverity || []} />
        </ChartPanel>
        <ChartPanel title="Tipe anomali" icon={<PieIcon size={18} />}>
          <PieBreakdown data={dataset.charts.anomalyTypes || []} />
        </ChartPanel>
        <ChartPanel title="Shift compliance" icon={<Clock size={18} />}>
          <ShiftComplianceChart data={dataset.charts.shiftCompliance || []} />
        </ChartPanel>
        <ChartPanel title="Employee risk" icon={<ShieldAlert size={18} />}>
          <EmployeeRiskChart data={dataset.charts.employeeRisk || []} />
        </ChartPanel>
        <ChartPanel title="Departemen tertinggi" icon={<Database size={18} />}>
          <BreakdownChart data={dataset.charts.topBreakdowns?.departments || []} />
        </ChartPanel>
        <ChartPanel title="Device tertinggi" icon={<Database size={18} />}>
          <BreakdownChart data={dataset.charts.topBreakdowns?.devices || []} />
        </ChartPanel>
      </section>
      <section className="workbench">
        <div className="section-title">
          <div>
            <p className="eyebrow">Heatmap</p>
            <h3>Event per hari dan jam</h3>
          </div>
        </div>
        <Heatmap data={dataset.charts.heatmap || []} threshold={eventThreshold} />
      </section>
      <section className="workbench">
        <div className="section-title">
          <div>
            <p className="eyebrow">Anomaly workbench</p>
            <h3>Baris yang perlu dicek</h3>
          </div>
          <a className="ghost-button" href={`${API_BASE}/datasets/${dataset.metadata.id}/anomalies.csv`}>
            <Download size={16} />
            CSV
          </a>
        </div>
        <AnomalyTable anomalies={dataset.anomalies || []} />
      </section>
    </>
  );
}

function ChartPanel({ title, icon, children }) {
  return (
    <article className="chart-panel">
      <div className="panel-header compact">
        <h3>{title}</h3>
        {icon}
      </div>
      <div className="chart-box">{children}</div>
    </article>
  );
}

function DailyEventsChart({ data, threshold }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="eventsFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="5%" stopColor={palette.cyan} stopOpacity={0.55} />
            <stop offset="95%" stopColor={palette.cyan} stopOpacity={0.04} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: "#8ea3bd", fontSize: 11 }} minTickGap={18} />
        <YAxis tick={{ fill: "#8ea3bd", fontSize: 11 }} width={42} />
        <Tooltip content={<ChartTooltip />} />
        {threshold > 0 && (
          <ReferenceLine y={threshold} stroke={palette.amber} strokeDasharray="4 4" label={{ value: "threshold", fill: "#f8b84e", fontSize: 11 }} />
        )}
        <Area type="monotone" dataKey="events" stroke={palette.cyan} fill="url(#eventsFill)" strokeWidth={2} />
        <Area type="monotone" dataKey="anomalies" stroke={palette.rose} fill="transparent" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function HourlyChart({ data, threshold }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="hour" tick={{ fill: "#8ea3bd", fontSize: 11 }} interval={2} />
        <YAxis tick={{ fill: "#8ea3bd", fontSize: 11 }} width={42} />
        <Tooltip content={<ChartTooltip />} />
        {threshold > 0 && <ReferenceLine y={threshold} stroke={palette.amber} strokeDasharray="4 4" />}
        <Bar dataKey="events" radius={[4, 4, 0, 0]}>
          {data.map((item, index) => (
            <Cell
              key={item.hour}
              fill={Number(item.events) >= threshold && threshold > 0 ? palette.rose : index % 4 === 0 ? palette.amber : palette.green}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function BreakdownChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 18, right: 12 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#8ea3bd", fontSize: 11 }} />
        <YAxis dataKey="name" type="category" tick={{ fill: "#8ea3bd", fontSize: 11 }} width={96} tickFormatter={(value) => truncate(value, 14)} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" fill={palette.violet} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ShiftComplianceChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
        <XAxis dataKey="shift" tick={{ fill: "#8ea3bd", fontSize: 11 }} />
        <YAxis tick={{ fill: "#8ea3bd", fontSize: 11 }} width={42} />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        <Bar dataKey="late" fill={palette.amber} radius={[4, 4, 0, 0]} />
        <Bar dataKey="early" fill={palette.rose} radius={[4, 4, 0, 0]} />
        <Bar dataKey="overtime" fill={palette.green} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function EmployeeRiskChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 18, right: 12 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#8ea3bd", fontSize: 11 }} />
        <YAxis dataKey="name" type="category" tick={{ fill: "#8ea3bd", fontSize: 11 }} width={120} tickFormatter={(value) => truncate(value, 16)} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="value" fill={palette.rose} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PieBreakdown({ data }) {
  const colors = [palette.rose, palette.amber, palette.violet, palette.cyan, palette.green, palette.blue];
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={100} paddingAngle={2}>
          {data.map((item, index) => (
            <Cell key={item.name} fill={colors[index % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Heatmap({ data, threshold }) {
  const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const byKey = new Map(data.map((item) => [`${item.dayIndex}-${item.hour}`, item]));
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-grid">
        <span className="heatmap-corner" />
        {Array.from({ length: 24 }, (_, hour) => (
          <span className="heatmap-hour" key={hour}>{hour}</span>
        ))}
        {days.map((day, dayIndex) => (
          <span key={day}>
            <span className="heatmap-day">{day}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const item = byKey.get(`${dayIndex}-${hour}`);
              const intensity = item?.intensity || 0;
              const overThreshold = threshold > 0 && Number(item?.events || 0) >= threshold;
              return (
                <span
                  key={`${day}-${hour}`}
                  className="heatmap-cell"
                  title={`${day} ${hour}:00 - ${item?.events || 0} event, ${item?.anomalies || 0} anomali`}
                  style={{
                    background: `rgba(54, 209, 220, ${0.08 + intensity * 0.85})`,
                    outlineColor: overThreshold
                      ? "rgba(248,184,78,.92)"
                      : item?.anomalies
                        ? "rgba(255,93,143,.75)"
                        : "rgba(255,255,255,.04)",
                  }}
                />
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey || item.name}>
          {item.name || item.dataKey}: {formatNumber(item.value)}
        </span>
      ))}
    </div>
  );
}

function AnomalyTable({ anomalies }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? anomalies : anomalies.filter((item) => item.severity === filter);

  return (
    <>
      <div className="filter-row">
        {["all", "critical", "high", "medium", "low"].map((item) => (
          <button
            className={filter === item ? "filter-chip active" : "filter-chip"}
            key={item}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>Row</th>
              <th>Type</th>
              <th>Person</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 350).map((item) => (
              <tr key={item.id}>
                <td><span className={`pill ${item.severity}`}>{item.severity}</span></td>
                <td>{item.rowNumber || "-"}</td>
                <td>{item.type}</td>
                <td>{truncate(item.person || "-", 28)}</td>
                <td>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

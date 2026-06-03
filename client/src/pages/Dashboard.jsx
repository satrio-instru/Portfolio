import { BrainCircuit } from "lucide-react";
import { formatNumber } from "../utils/format";

export default function DashboardPage({ activeDataset, datasets, loading, onSelectDataset }) {
  const summary = activeDataset?.summary;
  return (
    <>
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">Get started</p>
          <h2>Mesin analisa shift dan access-log berbasis AI.</h2>
          <p className="hero-text">
            Sistem ini membaca Excel besar, mengolah pola In/Out, menghitung telat,
            pulang cepat, lembur, keluar-masuk saat jam kerja, serta menandai data
            yang rawan human error atau vulnerability operasional.
          </p>
        </div>
        <div className="control-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Dataset</p>
              <h3>Upload tersimpan</h3>
            </div>
          </div>
          {loading && !datasets.length ? (
            <p className="muted">Memuat dataset...</p>
          ) : !datasets.length ? (
            <p className="muted">Belum ada upload tersimpan.</p>
          ) : (
            <div className="dataset-list">
              {datasets.map((dataset) => (
                <button
                  key={dataset.id}
                  className={`dataset-item ${dataset.id === activeDataset?.metadata?.id ? "active" : ""}`}
                  onClick={() => onSelectDataset(dataset.id)}
                >
                  <span>{dataset.originalName}</span>
                  <small>
                    {formatNumber(dataset.summary.totalRows)} rows · {formatNumber(dataset.summary.anomalyCount)} anomali
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {activeDataset ? (
        <>
          <section className="kpi-grid">
            <KpiCard label="Total baris" value={formatNumber(summary.totalRows)} tone="cyan" />
            <KpiCard label="Personel unik" value={formatNumber(summary.distinctPeople)} tone="green" />
            <KpiCard label="Anomali" value={formatNumber(summary.anomalyCount)} tone="rose" />
            <KpiCard label="Rasio anomali" value={`${(summary.anomalyRate * 100).toFixed(2)}%`} tone="amber" />
            <KpiCard label="Sesi shift" value={formatNumber(summary.shift?.sessions)} tone="blue" />
            <KpiCard label="Telat" value={formatNumber(summary.shift?.lateCount)} tone="amber" />
            <KpiCard label="Pulang cepat" value={formatNumber(summary.shift?.earlyLeaveCount)} tone="rose" />
            <KpiCard label="Lembur" value={formatNumber(summary.shift?.overtimeCount)} tone="green" />
          </section>
          <section className="analysis-grid">
            <AiPanel dataset={activeDataset} />
            <RiskPanel summary={summary} />
          </section>
          <section className="analysis-grid">
            <ShiftSummaryPanel summary={summary} />
            <VulnerabilityPanel dataset={activeDataset} />
          </section>
        </>
      ) : (
        <section className="empty-state">
          <BrainCircuit size={36} />
          <h2>Belum ada dataset.</h2>
          <p>Pilih file Excel atau CSV untuk memulai analisa.</p>
        </section>
      )}
    </>
  );
}

function KpiCard({ label, value, tone }) {
  return (
    <article className={`kpi-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AiPanel({ dataset }) {
  const ai = dataset.ai;
  return (
    <article className="info-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">AI insight</p>
          <h3>Ringkasan analisa</h3>
        </div>
        <BrainCircuit size={22} />
      </div>
      <p className="ai-summary">{ai.summary}</p>
      <div className="recommendations">
        {ai.recommendations?.slice(0, 4).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      {ai.externalAiError && <p className="error-text">AI eksternal: {ai.externalAiError}</p>}
      <p className="muted small">Source: {ai.source} · {ai.model}</p>
    </article>
  );
}

function RiskPanel({ summary }) {
  const rows = [
    ["Critical", summary.severity.critical || 0, "critical"],
    ["High", summary.severity.high || 0, "high"],
    ["Medium", summary.severity.medium || 0, "medium"],
    ["Low", summary.severity.low || 0, "low"],
  ];

  return (
    <article className="info-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Risk stack</p>
          <h3>Prioritas validasi</h3>
        </div>
      </div>
      <div className="risk-list">
        {rows.map(([label, value, tone]) => (
          <div className="risk-row" key={label}>
            <span className={`severity-dot ${tone}`} />
            <span>{label}</span>
            <strong>{formatNumber(value)}</strong>
          </div>
        ))}
      </div>
      <div className="type-list">
        {summary.topAnomalyTypes.slice(0, 5).map((item) => (
          <span key={item.name}>
            {item.name}: <strong>{formatNumber(item.value)}</strong>
          </span>
        ))}
      </div>
    </article>
  );
}

function ShiftSummaryPanel({ summary }) {
  const shift = summary.shift || {};
  const rows = [
    ["Sesi shift", shift.sessions],
    ["Telat", `${formatNumber(shift.lateCount)} sesi / ${formatNumber(shift.lateMinutes)} menit`],
    ["Pulang cepat", `${formatNumber(shift.earlyLeaveCount)} sesi / ${formatNumber(shift.earlyLeaveMinutes)} menit`],
    ["Lembur", `${formatNumber(shift.overtimeCount)} sesi / ${formatNumber(shift.overtimeMinutes)} menit`],
    ["Keluar saat kerja", `${formatNumber(shift.workExitCycles)} siklus`],
    ["Keluar saat istirahat", `${formatNumber(shift.breakExitCycles)} siklus`],
  ];

  return (
    <article className="info-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Shift analytics</p>
          <h3>08-16, 16-24, 24-08</h3>
        </div>
      </div>
      <div className="metric-list">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function VulnerabilityPanel({ dataset }) {
  return (
    <article className="info-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Vulnerability</p>
          <h3>Data yang perlu audit</h3>
        </div>
      </div>
      <div className="recommendations">
        {dataset.vulnerabilitySummary?.findings?.map((finding) => (
          <span key={finding.type}>
            <strong>{finding.title}</strong>
            <br />
            {formatNumber(finding.count)} temuan · {finding.detail}
          </span>
        ))}
      </div>
    </article>
  );
}

import { BarChart3, BrainCircuit, FileSpreadsheet, UploadCloud } from "lucide-react";
import { formatNumber, truncate } from "../utils/format";

export default function InputPage({
  activeDataset,
  datasets,
  records,
  loading,
  uploading,
  analyzing,
  analyzeMessage,
  onUpload,
  onStartLocalAnalyze,
  onStartAiAnalyze,
  onSelectDataset,
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Input Excel</p>
          <h2>Upload data baru atau gunakan upload lama.</h2>
        </div>
        <div className="page-actions">
          <label className="upload-button">
            <UploadCloud size={18} />
            <span>{uploading ? "Menganalisa..." : "Upload data"}</span>
            <input
              type="file"
              accept=".xls,.xlsx,.csv,.tsv"
              disabled={uploading}
              onChange={(event) => onUpload(event.target.files?.[0])}
            />
          </label>
          <button className="upload-button" disabled={!activeDataset || analyzing} onClick={onStartLocalAnalyze}>
            <BarChart3 size={16} />
            {analyzing ? "Analyzing..." : "Analyze Locally"}
          </button>
          <button className="upload-button ai-button" disabled={!activeDataset || analyzing} onClick={onStartAiAnalyze}>
            <BrainCircuit size={16} />
            {analyzing ? "Analyzing..." : "Analyze with AI"}
          </button>
        </div>
      </section>
      <section className="input-grid">
        <div className="control-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Dataset</p>
              <h3>Upload tersimpan</h3>
            </div>
            <FileSpreadsheet size={20} />
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
        <article className="info-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Dataset aktif</p>
              <h3>{activeDataset?.metadata.originalName || "Belum ada file"}</h3>
            </div>
            <FileSpreadsheet size={20} />
          </div>
          {activeDataset && (
            <div className="dataset-meta">
              <span>Sheet: {activeDataset.metadata.selectedSheet}</span>
              <span>Range tanggal: {activeDataset.summary.dateRange.start} sampai {activeDataset.summary.dateRange.end}</span>
              <span>Analyzer: {activeDataset.metadata.analyzerVersion}</span>
              <span>Shift grace: {activeDataset.shiftConfig?.graceMinutes || 5} menit</span>
            </div>
          )}
          {analyzeMessage && <p className="success-text">{analyzeMessage}</p>}
        </article>
      </section>
      {activeDataset && (
        <section className="workbench">
          <div className="section-title">
            <div>
              <p className="eyebrow">Preview data</p>
              <h3>Sample baris sumber</h3>
            </div>
          </div>
          <RecordsTable records={records} />
        </section>
      )}
    </>
  );
}

function RecordsTable({ records }) {
  const visibleColumns = ["Date", "Time", "Personnel ID", "First Name", "Last Name", "Department Name", "Device Name", "Event Point"];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Flag</th>
            <th>Shift</th>
            {visibleColumns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.rowNumber}>
              <td>{record.rowNumber}</td>
              <td>
                {record.anomaly ? (
                  <span className={`pill ${record.anomaly.maxSeverity}`}>{record.anomaly.count}</span>
                ) : (
                  <span className="muted">-</span>
                )}
              </td>
              <td>{record.shift?.label || "-"}</td>
              {visibleColumns.map((column) => (
                <td key={column}>{truncate(record.values?.[column] || "-", 32)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

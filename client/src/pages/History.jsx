import { Download, FileSpreadsheet } from "lucide-react";
import { formatNumber } from "../utils/format";
import { API_BASE } from "../config/api";

export default function HistoryPage({ datasets, activeDataset, onSelectDataset }) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">History</p>
          <h2>Riwayat dataset yang pernah dianalisa.</h2>
        </div>
      </section>

      {!datasets.length ? (
        <section className="empty-state">
          <FileSpreadsheet size={36} />
          <h2>Belum ada dataset.</h2>
          <p>Upload file melalui halaman Input untuk memulai.</p>
        </section>
      ) : (
        <section className="downloads-grid">
          {datasets.map((dataset) => (
            <article
              key={dataset.id}
              className={`download-card ${dataset.id === activeDataset?.metadata?.id ? "active" : ""}`}
              onClick={() => onSelectDataset(dataset.id)}
              style={{ cursor: "pointer" }}
            >
              <span className="download-icon"><FileSpreadsheet size={22} /></span>
              <strong>{dataset.originalName}</strong>
              <p>
                {formatNumber(dataset.summary?.totalRows)} rows · {formatNumber(dataset.summary?.anomalyCount)} anomali
              </p>
              <div className="download-links">
                <a href={`${API_BASE}/datasets/${dataset.id}/chart-data.json`} onClick={(e) => e.stopPropagation()}>
                  <Download size={14} /> JSON
                </a>
                <a href={`${API_BASE}/datasets/${dataset.id}/chart-data.csv`} onClick={(e) => e.stopPropagation()}>
                  <Download size={14} /> CSV
                </a>
                <a href={`${API_BASE}/datasets/${dataset.id}/anomalies.csv`} onClick={(e) => e.stopPropagation()}>
                  <Download size={14} /> Anomali
                </a>
                <a href={`${API_BASE}/datasets/${dataset.id}/employees.csv`} onClick={(e) => e.stopPropagation()}>
                  <Download size={14} /> Employee
                </a>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

import { useState, useMemo } from "react";
import { Download, FileSpreadsheet, Search, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { formatNumber } from "../utils/format";
import { UPLOAD_URL } from "../config/api";

export default function HistoryPage({ datasets, activeDataset, onSelectDataset }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);

  const activeId = selectedDatasetId || activeDataset?.metadata?.id;

  // Employee search across all datasets
  const employeeResults = useMemo(() => {
    if (!searchQuery.trim() || !datasets.length) return [];
    const q = searchQuery.toLowerCase();
    const results = [];

    for (const ds of datasets) {
      const employees = ds.summary?.topPersonnel || [];
      for (const emp of employees) {
        if (
          emp.name?.toLowerCase().includes(q) ||
          emp.department?.toLowerCase().includes(q) ||
          emp.employeeKey?.toLowerCase().includes(q)
        ) {
          results.push({ ...emp, datasetId: ds.id, datasetName: ds.originalName });
        }
      }
    }
    return results.slice(0, 20);
  }, [searchQuery, datasets]);

  async function handleDownload(datasetId, type) {
    try {
      const { supabase } = await import("../config/supabase");
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || "";
      const url = `${UPLOAD_URL}/datasets/${datasetId}/${type}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Gagal download");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = blobUrl; a.download = `${type}-${datasetId}`; a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (e) { console.error("Download error:", e); }
  }

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">History</p>
          <h2>Riwayat dataset & pencarian karyawan</h2>
        </div>
      </section>

      {/* Employee Search */}
      <section className="search-section">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            placeholder="Cari nama karyawan, departemen, atau ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {searchQuery.trim() && (
          <div className="search-results">
            {employeeResults.length === 0 ? (
              <p className="muted">Tidak ditemukan karyawan "{searchQuery}"</p>
            ) : (
              <div className="employee-search-grid">
                {employeeResults.map((emp, i) => (
                  <div key={`${emp.employeeKey}-${i}`} className="employee-search-card">
                    <div className="emp-header">
                      <strong>{emp.name || emp.employeeKey}</strong>
                      <span className="emp-dept">{emp.department || "-"}</span>
                    </div>
                    <div className="emp-stats">
                      <div className="emp-stat">
                        <TrendingUp size={14} />
                        <span>Risk: <strong>{emp.riskScore || 0}</strong></span>
                      </div>
                      <div className="emp-stat">
                        <AlertTriangle size={14} />
                        <span>Anomali: <strong>{emp.anomalyCount || 0}</strong></span>
                      </div>
                      <div className="emp-stat">
                        <Users size={14} />
                        <span>Dataset: <strong>{emp.datasetName}</strong></span>
                      </div>
                    </div>
                    <button className="ghost-button small" onClick={() => { setSelectedDatasetId(emp.datasetId); onSelectDataset(emp.datasetId); }}>
                      Lihat Detail
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Dataset List */}
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
              className={`download-card ${dataset.id === activeId ? "active" : ""}`}
              onClick={() => { setSelectedDatasetId(dataset.id); onSelectDataset(dataset.id); }}
              style={{ cursor: "pointer" }}
            >
              <span className="download-icon"><FileSpreadsheet size={22} /></span>
              <strong>{dataset.originalName}</strong>
              <p>
                {formatNumber(dataset.summary?.totalRows)} rows · {formatNumber(dataset.summary?.distinctPeople)} personel · {formatNumber(dataset.summary?.anomalyCount)} anomali
              </p>
              {dataset.summary?.shift && (
                <p className="muted small">
                  Telat: {dataset.summary.shift.lateCount || 0} · Pulang Cepat: {dataset.summary.shift.earlyLeaveCount || 0} · Lembur: {dataset.summary.shift.overtimeCount || 0}
                </p>
              )}
              <div className="download-links">
                <button onClick={(e) => { e.stopPropagation(); handleDownload(dataset.id, "chart-data.json"); }}>
                  <Download size={14} /> JSON
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDownload(dataset.id, "chart-data.csv"); }}>
                  <Download size={14} /> CSV
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDownload(dataset.id, "anomalies.csv"); }}>
                  <Download size={14} /> Anomali
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDownload(dataset.id, "employees.csv"); }}>
                  <Download size={14} /> Employee
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

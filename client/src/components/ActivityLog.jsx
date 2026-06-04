import { useState, useEffect } from "react";
import { useApi } from "../hooks/useApi";

export default function ActivityLog() {
  const { api } = useApi();
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) refresh();
  }, [open]);

  async function refresh() {
    try {
      const result = await api("/logs?limit=50");
      setLogs(result.logs || []);
    } catch {}
  }

  const levelColors = { info: "#3b82f6", error: "#ef4444", success: "#22c55e", warn: "#f59e0b" };

  return (
    <div className={`activity-log ${open ? "open" : ""}`}>
      <button className="log-toggle" onClick={() => setOpen(!open)}>
        {open ? "✕ Close Log" : "📋 Activity Log"}
      </button>
      {open && (
        <div className="log-panel">
          <div className="log-header">
            <h4>Activity Log</h4>
            <button onClick={refresh} className="ghost-button small">Refresh</button>
          </div>
          <div className="log-list">
            {logs.length === 0 && <p className="muted">Belum ada aktivitas.</p>}
            {logs.map((log) => (
              <div key={log.id} className="log-entry">
                <span className="log-dot" style={{ background: levelColors[log.level] || "#6b7280" }} />
                <div>
                  <strong>{log.action}</strong>
                  {log.details && <span className="log-details"> — {log.details}</span>}
                  <small>{new Date(log.created_at).toLocaleString("id-ID")}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

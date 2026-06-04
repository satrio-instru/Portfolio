import { useState, useEffect, useRef, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import { X, ClipboardList, GripHorizontal } from "lucide-react";

export default function ActivityLog() {
  const { api } = useApi();
  const [logs, setLogs] = useState([]);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: window.innerWidth - 440, y: window.innerHeight - 540 });
  const [dragging, setDragging] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (open) refresh();
    const interval = open ? setInterval(refresh, 15000) : null;
    return () => { if (interval) clearInterval(interval); };
  }, [open]);

  async function refresh() {
    try {
      const result = await api("/logs?limit=50");
      setLogs(result.logs || []);
    } catch {}
  }

  // Drag handlers
  const onMouseDown = useCallback((e) => {
    if (e.target.closest(".log-content") || e.target.closest("button")) return;
    setDragging(true);
    offsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 420, e.clientX - offsetRef.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - offsetRef.current.y)),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  const levelColors = { info: "#60a5fa", error: "#f87171", success: "#4ade80", warn: "#fbbf24" };

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button className="log-fab" onClick={() => setOpen(true)} title="Activity Log">
          <ClipboardList size={20} />
          <span>Log</span>
        </button>
      )}

      {/* Draggable popup */}
      {open && (
        <div
          ref={dragRef}
          className={`log-popup ${minimized ? "minimized" : ""}`}
          style={{ left: pos.x, top: pos.y }}
        >
          {/* Drag handle */}
          <div className="log-drag-handle" onMouseDown={onMouseDown}>
            <GripHorizontal size={14} />
            <span>Activity Log</span>
            <div className="log-drag-actions">
              <button onClick={() => setMinimized(!minimized)} title={minimized ? "Expand" : "Minimize"}>
                {minimized ? "□" : "—"}
              </button>
              <button onClick={() => setOpen(false)} title="Close">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Content */}
          {!minimized && (
            <div className="log-content">
              <div className="log-actions">
                <button onClick={refresh} className="log-refresh">Refresh</button>
              </div>
              <div className="log-list">
                {logs.length === 0 && <p className="log-empty">Belum ada aktivitas.</p>}
                {logs.map((log) => (
                  <div key={log.id} className="log-entry">
                    <span className="log-dot" style={{ background: levelColors[log.level] || "#6b7280" }} />
                    <div className="log-entry-body">
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
      )}
    </>
  );
}

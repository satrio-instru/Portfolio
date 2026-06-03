import { useState, useMemo } from "react";
import { Download, FileText, Search, Users } from "lucide-react";
import { formatNumber, truncate } from "../utils/format";
import { API_BASE } from "../config/api";

export default function EmployeeDetailPage({ dataset, employees, employeeQuery, setEmployeeQuery, selectedEmployee, selectedEmployeeKey, setSelectedEmployeeKey, employeeRecords, onExportPdf }) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Report per employee</p>
          <h2>Cari karyawan dan lihat riwayat shift-nya.</h2>
        </div>
        <div className="page-actions">
          <a className="ghost-button" href={`${API_BASE}/datasets/${dataset.metadata.id}/employees.csv`}>
            <Download size={16} />
            Export CSV
          </a>
          {selectedEmployee && (
            <button className="upload-button" onClick={() => onExportPdf(dataset.metadata.id, selectedEmployee.employeeKey)}>
              <FileText size={16} />
              Export PDF
            </button>
          )}
        </div>
      </section>
      <section className="employee-layout">
        <article className="control-panel">
          <label className="search-box">
            <Search size={16} />
            <input
              value={employeeQuery}
              onChange={(event) => setEmployeeQuery(event.target.value)}
              placeholder="Cari ID, nama, atau departemen"
            />
          </label>
          <p className="muted small">{employees.length} karyawan</p>
          <div className="employee-list">
            {employees.slice(0, 160).map((employee) => (
              <button
                key={employee.employeeKey}
                className={employee.employeeKey === selectedEmployeeKey ? "employee-item active" : "employee-item"}
                onClick={() => setSelectedEmployeeKey(employee.employeeKey)}
              >
                <span>{employee.displayName}</span>
                <small>{employee.department || "No department"} · risk {employee.riskScore}</small>
              </button>
            ))}
          </div>
        </article>
        {selectedEmployee ? (
          <article className="info-panel employee-detail">
            <div className="panel-header">
              <div>
                <p className="eyebrow">{selectedEmployee.riskLevel} risk</p>
                <h3>{selectedEmployee.displayName}</h3>
              </div>
              <strong className={`risk-badge ${selectedEmployee.riskLevel}`}>{selectedEmployee.riskScore}</strong>
            </div>
            <p className="muted">{selectedEmployee.department || "Departemen belum terbaca"}</p>
            <MetricGrid employee={selectedEmployee} />
            <SessionTable sessions={selectedEmployee.sessions || []} />
          </article>
        ) : (
          <section className="empty-state">
            <Users size={34} />
            <h2>Pilih karyawan.</h2>
          </section>
        )}
      </section>
      {selectedEmployee && (
        <section className="workbench">
          <div className="section-title">
            <div>
              <p className="eyebrow">Raw employee records</p>
              <h3>Sample scan milik karyawan terpilih</h3>
            </div>
          </div>
          <RecordsTable records={employeeRecords} />
        </section>
      )}
    </>
  );
}

function MetricGrid({ employee }) {
  const metrics = employee.metrics;
  const items = [
    ["Sesi", metrics.sessions],
    ["Telat", `${metrics.lateCount} / ${formatNumber(metrics.lateMinutes)} mnt`],
    ["Pulang cepat", `${metrics.earlyLeaveCount} / ${formatNumber(metrics.earlyLeaveMinutes)} mnt`],
    ["Lembur", `${metrics.overtimeCount} / ${formatNumber(metrics.overtimeMinutes)} mnt`],
    ["Keluar kerja", metrics.workExitCycles],
    ["Keluar istirahat", metrics.breakExitCycles],
    ["Scan/session", metrics.avgScansPerSession],
    ["Anomali", employee.anomalies?.total || 0],
  ];

  return (
    <div className="employee-metrics">
      {items.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function SessionTable({ sessions }) {
  return (
    <div className="table-wrap compact-table">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Shift</th>
            <th>First IN</th>
            <th>Last OUT</th>
            <th>Telat</th>
            <th>Pulang cepat</th>
            <th>Lembur</th>
            <th>Keluar kerja</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>{session.workDate}</td>
              <td>{session.shift}</td>
              <td>{session.firstIn?.time || "-"}</td>
              <td>{session.lastOut?.time || "-"}</td>
              <td>{session.lateMinutes}</td>
              <td>{session.earlyLeaveMinutes}</td>
              <td>{session.overtimeMinutes}</td>
              <td>{session.workExitCycles}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

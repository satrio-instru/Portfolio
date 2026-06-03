import { Link } from "react-router-dom";
import { Database } from "lucide-react";

export default function NotFound() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Database size={32} />
          <h1>VATh</h1>
        </div>
        <div className="verify-content">
          <h2>404 — Halaman Tidak Ditemukan</h2>
          <p>Halaman yang Anda cari tidak tersedia.</p>
          <Link to="/dashboard" className="upload-button">
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

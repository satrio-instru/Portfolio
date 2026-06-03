import { Link } from "react-router-dom";
import { Database, ShieldCheck, BarChart3, FileText, ArrowRight } from "lucide-react";

export default function Landing() {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-brand">
          <Database size={40} />
          <h1>VATh</h1>
          <p className="eyebrow">Verification Analytical Tools Helper</p>
        </div>
        <p className="landing-subtitle">
          Platform analitik workforce modern untuk audit shift, access-log, dan deteksi anomali berbasis AI.
        </p>
        <div className="landing-actions">
          <Link to="/login" className="upload-button">
            Masuk <ArrowRight size={16} />
          </Link>
          <Link to="/register" className="ghost-button">
            Daftar Akun
          </Link>
        </div>
      </section>

      <section className="landing-features">
        <div className="feature-card">
          <ShieldCheck size={28} />
          <h3>Deteksi Anomali</h3>
          <p>Analisis otomatis keterlambatan, pulang cepat, lembur, dan pola mencurigakan.</p>
        </div>
        <div className="feature-card">
          <BarChart3 size={28} />
          <h3>Visualisasi Interaktif</h3>
          <p>Dashboard dengan chart, heatmap, dan KPI real-time.</p>
        </div>
        <div className="feature-card">
          <FileText size={28} />
          <h3>Export PDF</h3>
          <p>Generate laporan formal per karyawan dalam format PDF profesional.</p>
        </div>
      </section>

      <footer className="landing-footer">
        <p>VATh — Verification Analytical Tools Helper</p>
      </footer>
    </div>
  );
}

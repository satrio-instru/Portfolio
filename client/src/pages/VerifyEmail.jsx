import { Link } from "react-router-dom";
import { Database, Mail } from "lucide-react";

export default function VerifyEmail() {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Database size={32} />
          <h1>VATh</h1>
          <p className="eyebrow">Verification Analytical Tools Helper</p>
        </div>
        <div className="verify-content">
          <Mail size={48} />
          <h2>Verifikasi Email</h2>
          <p>
            Kami telah mengemail link verifikasi ke alamat email Anda.
            Silakan cek inbox atau folder spam untuk mengaktifkan akun.
          </p>
          <Link to="/login" className="upload-button">
            Kembali ke Login
          </Link>
        </div>
      </div>
    </div>
  );
}

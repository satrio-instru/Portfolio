import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Database, UserPlus } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirmPassword) {
      showToast("Password tidak cocok.", "error");
      return;
    }
    if (password.length < 6) {
      showToast("Password minimal 6 karakter.", "error");
      return;
    }
    setLoading(true);
    try {
      await signUp(email, password);
      showToast("Registrasi berhasil! Silakan cek email untuk verifikasi.", "success");
      navigate("/verify-email");
    } catch (err) {
      showToast(err.message || "Registrasi gagal.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <Database size={32} />
          <h1>VATh</h1>
          <p className="eyebrow">Verification Analytical Tools Helper</p>
        </div>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              required
            />
          </label>
          <label>
            <span>Konfirmasi Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Ulangi password"
              required
            />
          </label>
          <button type="submit" className="upload-button" disabled={loading}>
            <UserPlus size={16} />
            {loading ? "Mendaftar..." : "Daftar"}
          </button>
        </form>
        <p className="auth-link">
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </p>
      </div>
    </div>
  );
}

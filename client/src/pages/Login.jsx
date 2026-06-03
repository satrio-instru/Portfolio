import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Database, LogIn } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(email, password);
      showToast("Login berhasil!", "success");
      navigate("/dashboard");
    } catch (err) {
      showToast(err.message || "Login gagal.", "error");
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
              placeholder="Masukkan password"
              required
            />
          </label>
          <button type="submit" className="upload-button" disabled={loading}>
            <LogIn size={16} />
            {loading ? "Masuk..." : "Masuk"}
          </button>
        </form>
        <p className="auth-link">
          Belum punya akun? <Link to="/register">Daftar</Link>
        </p>
      </div>
    </div>
  );
}

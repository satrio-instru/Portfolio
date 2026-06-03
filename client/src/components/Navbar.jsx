import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Clock,
  Database,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  UploadCloud,
  Users,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/input", label: "Input", icon: UploadCloud },
  { to: "/output", label: "Output", icon: BarChart3 },
  { to: "/visualization", label: "Visualisasi", icon: Database },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "AI Config", icon: Settings },
];

export default function Navbar() {
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await signOut();
      showToast("Berhasil logout.", "success");
      navigate("/login");
    } catch {
      showToast("Gagal logout.", "error");
    }
  }

  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark">
          <Database size={18} />
        </span>
        <div>
          <p className="eyebrow">VATh</p>
          <h1>Verification Analytical Tools Helper</h1>
        </div>
      </div>

      <nav className="tab-nav" aria-label="Main menu">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "tab-button active" : "tab-button"
              }
            >
              <Icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="topbar-actions">
        {user && (
          <>
            <span className="user-email">{user.email}</span>
            <button className="icon-button" onClick={handleSignOut} title="Logout">
              <LogOut size={18} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

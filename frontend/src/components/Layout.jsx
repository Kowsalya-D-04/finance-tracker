import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "./Icon";
import TransactionModal from "./TransactionModal";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/transactions", label: "Transactions", icon: "transactions" },
  { to: "/budgets", label: "Budgets", icon: "budget" },
  { to: "/goals", label: "Savings goals", icon: "goal" },
  { to: "/reports", label: "Reports", icon: "report" },
  { to: "/ml-insights", label: "ML Insights", icon: "brain" },
  { to: "/categories", label: "Categories", icon: "category" },
  { to: "/notifications", label: "Notifications", icon: "bell" },
  { to: "/profile", label: "Profile", icon: "user" },
];

export function Brand({ light = false }) {
  return (
    <span className={`brand ${light ? "light" : ""}`}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? "#1C3D35" : "#15302A"} />
        <path d="M9 22V10h3v9.5h7V22z" fill="#7FD1AE" />
        <circle cx="22" cy="12" r="3" fill="#F2C14E" />
      </svg>
      <span className="brand-text">
        <strong>Personal Finance</strong>
        <small>Expense Tracker</small>
      </span>
    </span>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { unread, openTransaction } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const initials = (user?.name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-top">
          <Brand light />
          <button className="icon-btn only-mobile" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.to === "/notifications" && unread > 0 && <em className="nav-count">{unread > 99 ? "99+" : unread}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <span className="avatar">{initials}</span>
            <span className="me-text"><strong>{user?.name}</strong><small>{user?.email}</small></span>
          </div>
          <button className="nav-link logout" onClick={handleLogout}>
            <Icon name="logout" /><span>Log out</span>
          </button>
        </div>
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn only-mobile" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <span className="topbar-greet">Hello, {user?.name?.split(" ")[0]}</span>
          <div className="topbar-actions">
            <NavLink to="/notifications" className="icon-btn bell" aria-label={`Notifications, ${unread} unread`}>
              <Icon name="bell" />
              {unread > 0 && <i className="bell-dot" />}
            </NavLink>
            <button className="btn income-btn" onClick={() => openTransaction(null, "income")}>
              <Icon name="plus" size={16} /> <span>Income</span>
            </button>
            <button className="btn primary" onClick={() => openTransaction(null, "expense")}>
              <Icon name="plus" size={16} /> <span>Expense</span>
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      <TransactionModal />
    </div>
  );
}

import Icon from "./Icon";
import { useApp } from "../context/AppContext";

export function ProgressBar({ value, status, colour }) {
  const pct = Math.max(0, Math.min(100, value || 0));
  const tone = status === "Exceeded" ? "danger" : status === "Near Limit" ? "warn" : status === "Completed" ? "done" : "ok";
  return (
    <div className={`progress ${tone}`} role="progressbar" aria-valuenow={Math.round(value || 0)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%`, ...(colour && tone === "ok" ? { background: colour } : {}) }} />
    </div>
  );
}

const STATUS_TONE = {
  "Under Budget": "ok", "Near Limit": "warn", Exceeded: "danger",
  "In Progress": "info", Completed: "ok", Overdue: "danger",
};

export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_TONE[status] || "info"}`}>{status}</span>;
}

export function TypeBadge({ type }) {
  return (
    <span className={`type-pill ${type}`}>
      <Icon name={type === "income" ? "down" : "up"} size={12} strokeWidth={2.4} />
      {type === "income" ? "Income" : "Expense"}
    </span>
  );
}

export function CategoryDot({ colour, name }) {
  return (
    <span className="cat-dot">
      <i style={{ background: colour || "#8C9590" }} />
      {name}
    </span>
  );
}

export function EmptyState({ icon = "wallet", title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon"><Icon name={icon} size={22} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Loader({ label = "Loading" }) {
  return (
    <div className="loader" role="status">
      <span className="spinner" />
      <span>{label}…</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <div className={`field ${error ? "has-error" : ""}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <Icon name={t.tone === "error" ? "alert" : "check"} size={16} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

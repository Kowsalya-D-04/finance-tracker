import { Link } from "react-router-dom";
import { Brand } from "../components/Layout";

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="auth">
      <aside className="auth-side">
        <Link to="/" aria-label="Home"><Brand light /></Link>
        <blockquote>
          <p>Income, expenses, budgets and savings goals, all in one ledger that adds itself up.</p>
        </blockquote>
        <ul className="auth-points">
          <li>Passwords are stored as salted hashes</li>
          <li>Your records are visible only to you</li>
          <li>Export reports as CSV or PDF</li>
        </ul>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="auth-sub">{subtitle}</p>}
          {children}
          {footer && <p className="auth-foot">{footer}</p>}
        </div>
      </main>
    </div>
  );
}

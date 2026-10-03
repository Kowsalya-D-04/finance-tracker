import { Link } from "react-router-dom";
import { Brand } from "../components/Layout";
import Icon from "../components/Icon";

const FEATURES = [
  { icon: "transactions", title: "Record every rupee", text: "Log income and expenses with category, date, payment method and a note. Cash and UPI in the same place." },
  { icon: "budget", title: "Monthly budgets", text: "Set a limit per category. You get a warning as you approach it and an alert when you cross it." },
  { icon: "goal", title: "Savings goals", text: "Save towards an emergency fund, a laptop or a trip, and see how much is left and how much to set aside each month." },
  { icon: "report", title: "Reports you can export", text: "Monthly and date-range summaries with category breakdowns, charts, and CSV or PDF downloads." },
];

// Sample ledger shown in the hero so visitors see what the dashboard tracks.
const LEDGER = [
  { d: "01 Sep", what: "Salary", method: "Bank Transfer", amt: "+ ₹75,000", type: "income" },
  { d: "03 Sep", what: "Rent", method: "Bank Transfer", amt: "− ₹18,000", type: "expense" },
  { d: "06 Sep", what: "Groceries", method: "UPI", amt: "− ₹2,340", type: "expense" },
  { d: "09 Sep", what: "Metro recharge", method: "Wallet", amt: "− ₹500", type: "expense" },
  { d: "14 Sep", what: "Freelance project", method: "UPI", amt: "+ ₹12,000", type: "income" },
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <div className="landing-nav-actions">
          <Link to="/login" className="btn ghost">Log in</Link>
          <Link to="/register" className="btn primary">Create account</Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <h1>Digital Personal Finance Management and Expense Tracker</h1>
          <p className="lede">
            Replace the notebook and the spreadsheet. Record what you earn and spend, set monthly limits,
            save towards goals, and see where your money goes each month.
          </p>
          <div className="hero-cta">
            <Link to="/register" className="btn primary lg">Create a free account</Link>
            <Link to="/login" className="btn ghost lg">I already have an account</Link>
          </div>
        </div>

        <div className="passbook" aria-label="Sample of a monthly ledger">
          <div className="passbook-head">
            <span>September</span>
            <span className="passbook-balance">
              <small>Balance</small>
              <strong>₹66,160</strong>
            </span>
          </div>
          <ol className="passbook-rows">
            {LEDGER.map((row) => (
              <li key={row.d + row.what}>
                <time>{row.d}</time>
                <span className="pb-what">{row.what}<small>{row.method}</small></span>
                <b className={row.type}>{row.amt}</b>
              </li>
            ))}
          </ol>
          <div className="passbook-budget">
            <span>Food budget</span>
            <div className="progress warn"><span style={{ width: "86%" }} /></div>
            <small>86% of ₹8,000 used · ₹1,120 left</small>
          </div>
        </div>
      </section>

      <section className="features" aria-label="Features">
        {FEATURES.map((f) => (
          <article key={f.title} className="feature">
            <span className="feature-icon"><Icon name={f.icon} size={20} /></span>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
          </article>
        ))}
      </section>

      <footer className="landing-foot">
        <span>MCA project · React, Flask and SQLite/MySQL</span>
        <Link to="/register">Get started</Link>
      </footer>
    </div>
  );
}

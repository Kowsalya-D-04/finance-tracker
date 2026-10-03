import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import Icon from "../components/Icon";
import { ConfirmDialog } from "../components/Modal";
import { IncomeExpenseChart, SpendingTrendChart, CategoryDonut, BudgetUsageChart } from "../components/Charts";
import { CategoryDot, EmptyState, Loader, ProgressBar, StatusBadge, TypeBadge } from "../components/UI";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { errorMessage, formatDate, formatMoney, timeAgo } from "../utils/format";

function Change({ value, goodWhenUp }) {
  if (value === null || value === undefined) return null;
  const up = value >= 0;
  const good = goodWhenUp ? up : !up;
  return (
    <span className={`delta ${good ? "good" : "bad"}`}>
      <Icon name={up ? "up" : "down"} size={12} strokeWidth={2.6} />
      {Math.abs(value)}% vs last month
    </span>
  );
}

const ALERT_ICON = { budget_warning: "alert", budget_exceeded: "alert", goal_progress: "goal", goal_completed: "check" };

export default function Dashboard() {
  const { currency } = useAuth();
  const { dataVersion, dataChanged, openTransaction, toast } = useApp();
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    api.get("/dashboard/summary", { params: { period } })
      .then((r) => { setData(r.data); setError(""); })
      .catch((err) => setError(errorMessage(err)));
  }, [period]);

  // Recalculates whenever a transaction, budget or goal changes anywhere in the app
  useEffect(() => { load(); }, [load, dataVersion]);

  const money = (v) => formatMoney(v, currency);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/transactions/${toDelete.id}`);
      toast("Transaction deleted.");
      setToDelete(null);
      dataChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setDeleting(false);
    }
  };

  if (error && !data) return <div className="alert danger">{error}</div>;
  if (!data) return <Loader label="Loading your dashboard" />;

  const { cards } = data;
  const isEmpty = cards.transaction_count === 0 && data.recent_transactions.length === 0;

  return (
    <div className="dashboard">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>{period === "all" ? "All-time totals" : `Figures for ${data.period_label}`}. Balance is always all-time.</p>
        </div>
        <div className="segmented small" role="radiogroup" aria-label="Period">
          <button role="radio" aria-checked={period === "month"} className={`seg ${period === "month" ? "active" : ""}`}
            onClick={() => setPeriod("month")}>This month</button>
          <button role="radio" aria-checked={period === "all"} className={`seg ${period === "all" ? "active" : ""}`}
            onClick={() => setPeriod("all")}>All time</button>
        </div>
      </div>

      {isEmpty && (
        <div className="welcome-strip">
          <div>
            <h2>Start with your first entry</h2>
            <p>Add this month's income, then a few expenses. The cards, charts and budgets update as you go.</p>
          </div>
          <button className="btn primary" onClick={() => openTransaction(null, "income")}>Add income</button>
        </div>
      )}

      <section className="summary">
        <div className="balance-card">
          <span className="bc-label"><Icon name="wallet" size={16} /> Total balance</span>
          <strong className={`bc-amount ${cards.balance < 0 ? "neg" : ""}`}>{money(cards.balance)}</strong>
          <span className="bc-note">Everything earned minus everything spent</span>
          <div className="bc-foot">
            <span><small>Set aside in goals</small>{money(cards.goal_savings)}</span>
            <span><small>Transactions ({period === "all" ? "all time" : "this month"})</small>{cards.transaction_count}</span>
          </div>
        </div>
        <div className="stat income">
          <span className="stat-label">Total income</span>
          <strong>{money(cards.income)}</strong>
          <Change value={cards.income_change} goodWhenUp />
        </div>
        <div className="stat expense">
          <span className="stat-label">Total expenses</span>
          <strong>{money(cards.expense)}</strong>
          <Change value={cards.expense_change} goodWhenUp={false} />
        </div>
        <div className="stat savings">
          <span className="stat-label">Total savings</span>
          <strong className={cards.savings < 0 ? "neg" : ""}>{money(cards.savings)}</strong>
          <span className="stat-sub">{cards.savings_rate}% of income kept</span>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Income vs expenses</h2><span className="muted">Last 6 months</span></div>
          <IncomeExpenseChart data={data.income_vs_expense} currency={currency} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Spending by category</h2>
            <span className="muted">{data.period_label}</span>
          </div>
          <CategoryDonut data={data.category_expenses} currency={currency} />
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Monthly spending trend</h2><span className="muted">Cumulative, this month</span></div>
          <SpendingTrendChart data={data.spending_trend} currency={currency} />
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Budget usage</h2>
            <Link to="/budgets" className="link">Manage budgets</Link>
          </div>
          <BudgetUsageChart data={data.budgets} currency={currency} />
        </div>
      </section>

      <section className="grid-main">
        <div className="panel">
          <div className="panel-head">
            <h2>Recent transactions</h2>
            <Link to="/transactions" className="link">View all</Link>
          </div>
          {data.recent_transactions.length === 0 ? (
            <EmptyState icon="transactions" title="No transactions yet"
              action={<button className="btn primary" onClick={() => openTransaction()}>Add transaction</button>} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Date</th><th>Type</th><th>Category</th><th>Payment</th><th className="num">Amount</th><th /></tr>
                </thead>
                <tbody>
                  {data.recent_transactions.map((t) => (
                    <tr key={t.id}>
                      <td className="nowrap">{formatDate(t.date, { day: "2-digit", month: "short" })}</td>
                      <td><TypeBadge type={t.type} /></td>
                      <td><CategoryDot colour={t.category_colour} name={t.category} />{t.note && <small className="sub">{t.note}</small>}</td>
                      <td className="muted">{t.payment_method}</td>
                      <td className={`num amount ${t.type}`}>{t.type === "income" ? "+" : "−"} {money(t.amount)}</td>
                      <td className="row-actions">
                        <button className="icon-btn" onClick={() => openTransaction(t)} aria-label="Edit"><Icon name="edit" size={16} /></button>
                        <button className="icon-btn danger" onClick={() => setToDelete(t)} aria-label="Delete"><Icon name="trash" size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="side-stack">
          <div className="panel">
            <div className="panel-head"><h2>Alerts</h2><Link to="/notifications" className="link">See all</Link></div>
            {data.notifications.length === 0 ? (
              <p className="muted small">No alerts. You will be notified here when a budget nears its limit or a goal hits a milestone.</p>
            ) : (
              <ul className="alert-list">
                {data.notifications.map((n) => (
                  <li key={n.id} className={`${n.kind} ${n.is_read ? "" : "unread"}`}>
                    <span className="al-icon"><Icon name={ALERT_ICON[n.kind] || "bell"} size={15} /></span>
                    <div><strong>{n.title}</strong><small>{timeAgo(n.created_at)}</small></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="grid-2">
        <div className="panel">
          <div className="panel-head"><h2>Budget overview</h2><span className="muted">{data.period_label.replace("All time", "This month")}</span></div>
          {data.budgets.length === 0 ? (
            <EmptyState icon="budget" title="No budgets for this month"
              action={<Link to="/budgets" className="btn ghost">Set a budget</Link>} />
          ) : (
            <ul className="budget-list">
              {data.budgets.map((b) => (
                <li key={b.id}>
                  <div className="bl-top">
                    <CategoryDot colour={b.colour} name={b.category} />
                    <StatusBadge status={b.status} />
                  </div>
                  <ProgressBar value={b.usage_percentage} status={b.status} />
                  <div className="bl-bottom">
                    <span>{money(b.spent)} of {money(b.limit_amount)}</span>
                    <span className={b.remaining < 0 ? "neg" : ""}>
                      {b.usage_percentage}% · {b.remaining < 0 ? `${money(-b.remaining)} over` : `${money(b.remaining)} left`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-head"><h2>Savings goals</h2><Link to="/goals" className="link">All goals</Link></div>
          {data.goals.length === 0 ? (
            <EmptyState icon="goal" title="No savings goals yet"
              action={<Link to="/goals" className="btn ghost">Create a goal</Link>} />
          ) : (
            <ul className="budget-list">
              {data.goals.map((g) => (
                <li key={g.id}>
                  <div className="bl-top">
                    <strong>{g.title}</strong>
                    <StatusBadge status={g.status} />
                  </div>
                  <ProgressBar value={g.progress_percentage} status={g.status === "Completed" ? "Completed" : ""} />
                  <div className="bl-bottom">
                    <span>{money(g.saved_amount)} of {money(g.target_amount)} ({g.progress_percentage}%)</span>
                    <span>{g.target_date ? `by ${formatDate(g.target_date)}` : "No target date"}</span>
                  </div>
                  <small className="muted">{g.remaining > 0 ? `${money(g.remaining)} remaining` : "Target reached"}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(toDelete)} title="Delete transaction?" busy={deleting}
        message={toDelete ? `This removes the ${toDelete.type} of ${money(toDelete.amount)} (${toDelete.category}) on ${formatDate(toDelete.date)}. Totals, budgets and reports will be recalculated.` : ""}
        onCancel={() => setToDelete(null)} onConfirm={confirmDelete}
      />
    </div>
  );
}

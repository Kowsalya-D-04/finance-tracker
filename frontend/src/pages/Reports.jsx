import { useCallback, useEffect, useState } from "react";
import api, { downloadFile } from "../api";
import Icon from "../components/Icon";
import { CategoryDonut, IncomeExpenseChart, SpendingTrendChart } from "../components/Charts";
import { CategoryDot, EmptyState, Loader, PageHeader, ProgressBar, StatusBadge, TypeBadge } from "../components/UI";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { MONTHS, errorMessage, formatDate, formatMoney, todayISO, yearOptions } from "../utils/format";

export default function Reports() {
  const { currency } = useAuth();
  const { dataVersion, toast } = useApp();
  const now = new Date();
  const [mode, setMode] = useState("monthly");
  const [filters, setFilters] = useState({
    month: now.getMonth() + 1, year: now.getFullYear(),
    start_date: todayISO().slice(0, 8) + "01", end_date: todayISO(), type: "", category_id: "",
  });
  const [categories, setCategories] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data.categories)).catch(() => {});
  }, []);

  const params = useCallback(() => {
    const p = mode === "monthly"
      ? { month: filters.month, year: filters.year }
      : { start_date: filters.start_date, end_date: filters.end_date };
    if (filters.type) p.type = filters.type;
    if (filters.category_id) p.category_id = filters.category_id;
    return p;
  }, [mode, filters]);

  const generate = useCallback(async () => {
    if (mode === "range" && (!filters.start_date || !filters.end_date || filters.start_date > filters.end_date)) {
      toast("Choose a start date that is on or before the end date.", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get("/reports/monthly", { params: params() });
      setReport(res.data);
      setShowAll(false);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }, [mode, filters, params, toast]);

  // Generate once on open, and again whenever data changes elsewhere
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { generate(); }, [dataVersion]);

  const exportAs = async (kind) => {
    setExporting(kind);
    try {
      await downloadFile(`/reports/export/${kind}`, params(), `finance-report.${kind}`);
      toast(`${kind.toUpperCase()} downloaded.`);
    } catch (err) {
      toast(errorMessage(err, "Export failed."), "error");
    } finally {
      setExporting("");
    }
  };

  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value,
    ...(key === "type" ? { category_id: "" } : {}) }));
  const money = (v) => formatMoney(v, currency);
  const catOptions = categories.filter((c) => !filters.type || c.type === filters.type);
  const s = report?.summary;
  const newestFirst = report ? [...report.transactions].reverse() : [];
  const txs = showAll ? newestFirst : newestFirst.slice(0, 15);

  return (
    <>
      <PageHeader title="Reports and analytics" subtitle="Summarise any month or date range, then export it.">
        <button className="btn ghost" onClick={() => exportAs("csv")} disabled={!report || exporting}>
          <Icon name="download" size={16} /> {exporting === "csv" ? "Exporting…" : "Export CSV"}
        </button>
        <button className="btn ghost" onClick={() => exportAs("pdf")} disabled={!report || exporting}>
          <Icon name="download" size={16} /> {exporting === "pdf" ? "Exporting…" : "Export PDF"}
        </button>
      </PageHeader>

      <div className="panel filters report-filters">
        <div className="segmented small">
          <button className={`seg ${mode === "monthly" ? "active" : ""}`} onClick={() => setMode("monthly")}>Month</button>
          <button className={`seg ${mode === "range" ? "active" : ""}`} onClick={() => setMode("range")}>Date range</button>
        </div>
        <div className="filter-grid">
          {mode === "monthly" ? (
            <>
              <label>Month
                <select value={filters.month} onChange={set("month")}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </label>
              <label>Year
                <select value={filters.year} onChange={set("year")}>
                  {yearOptions().map((y) => <option key={y}>{y}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <label>From<input type="date" value={filters.start_date} onChange={set("start_date")} /></label>
              <label>To<input type="date" value={filters.end_date} onChange={set("end_date")} /></label>
            </>
          )}
          <label>Transaction type
            <select value={filters.type} onChange={set("type")}>
              <option value="">Income and expenses</option>
              <option value="income">Income only</option>
              <option value="expense">Expenses only</option>
            </select>
          </label>
          <label>Category
            <select value={filters.category_id} onChange={set("category_id")}>
              <option value="">All categories</option>
              {catOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{filters.type ? "" : ` (${c.type})`}</option>)}
            </select>
          </label>
          <button className="btn primary" onClick={generate} disabled={loading}>
            {loading ? "Generating…" : "Generate report"}
          </button>
        </div>
      </div>

      {!report ? <Loader label="Preparing report" /> : (
        <div className={`report-body ${loading ? "is-loading" : ""}`}>
          <div className="report-title">
            <h2>{report.period_label}</h2>
            <span className="muted">Generated {report.generated_at}</span>
          </div>

          <section className="summary report-cards">
            <div className="stat income"><span className="stat-label">Total income</span><strong>{money(s.income)}</strong>
              <span className="stat-sub">{report.category_income.length} source{report.category_income.length === 1 ? "" : "s"}</span></div>
            <div className="stat expense"><span className="stat-label">Total expenses</span><strong>{money(s.expense)}</strong>
              <span className="stat-sub">{money(s.average_daily_expense)} a day on average</span></div>
            <div className="stat"><span className="stat-label">Balance</span><strong className={s.balance < 0 ? "neg" : ""}>{money(s.balance)}</strong>
              <span className="stat-sub">Income minus expenses</span></div>
            <div className="stat savings"><span className="stat-label">Savings</span><strong className={s.savings < 0 ? "neg" : ""}>{money(s.savings)}</strong>
              <span className="stat-sub">{s.savings_rate}% of income · {s.transaction_count} transactions</span></div>
          </section>

          {s.transaction_count === 0 ? (
            <div className="panel"><EmptyState icon="report" title="Nothing to report for this period"
              text="No transactions match the selected period and filters." /></div>
          ) : (
            <>
              <section className="grid-2">
                <div className="panel">
                  <div className="panel-head"><h2>Monthly income vs expenses</h2><span className="muted">6 months to {report.end_date.slice(0, 7)}</span></div>
                  <IncomeExpenseChart data={report.monthly_comparison} currency={currency} />
                </div>
                <div className="panel">
                  <div className="panel-head"><h2>Category spending</h2></div>
                  <CategoryDonut data={report.category_expenses} currency={currency} />
                </div>
              </section>

              {report.spending_trend.length > 0 && (
                <div className="panel">
                  <div className="panel-head"><h2>Spending trend</h2><span className="muted">Cumulative expenses over the period</span></div>
                  <SpendingTrendChart data={report.spending_trend} currency={currency} height={240} />
                </div>
              )}

              <section className="grid-2">
                <div className="panel flush">
                  <div className="panel-head pad"><h2>Category-wise expenses</h2></div>
                  {report.category_expenses.length === 0 ? <p className="muted pad">No expenses in this report.</p> : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead><tr><th>Category</th><th className="num">Amount</th><th>Share</th><th className="num">Count</th></tr></thead>
                        <tbody>
                          {report.category_expenses.map((c) => (
                            <tr key={c.category_id}>
                              <td><CategoryDot colour={c.colour} name={c.category} /></td>
                              <td className="num">{money(c.amount)}</td>
                              <td className="usage-cell"><ProgressBar value={c.percentage} colour={c.colour} /><small>{c.percentage}%</small></td>
                              <td className="num">{c.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="side-stack">
                  <div className="panel flush">
                    <div className="panel-head pad"><h2>Monthly comparison</h2></div>
                    <div className="table-wrap">
                      <table className="table compact">
                        <thead><tr><th>Month</th><th className="num">Income</th><th className="num">Expenses</th><th className="num">Savings</th></tr></thead>
                        <tbody>
                          {report.monthly_comparison.map((m) => (
                            <tr key={m.label}>
                              <td>{m.label}</td>
                              <td className="num income">{money(m.income)}</td>
                              <td className="num expense">{money(m.expense)}</td>
                              <td className={`num ${m.savings < 0 ? "neg" : ""}`}>{money(m.savings)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {report.payment_methods.length > 0 && (
                    <div className="panel flush">
                      <div className="panel-head pad"><h2>By payment method</h2></div>
                      <div className="table-wrap">
                        <table className="table compact">
                          <thead><tr><th>Method</th><th className="num">Income</th><th className="num">Expenses</th><th className="num">Count</th></tr></thead>
                          <tbody>
                            {report.payment_methods.map((p) => (
                              <tr key={p.payment_method}>
                                <td>{p.payment_method}</td>
                                <td className="num">{money(p.income)}</td>
                                <td className="num">{money(p.expense)}</td>
                                <td className="num">{p.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {report.budgets.length > 0 && (
                <div className="panel flush">
                  <div className="panel-head pad"><h2>Budgets for {report.period_label}</h2></div>
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Category</th><th className="num">Limit</th><th className="num">Spent</th><th className="num">Remaining</th><th>Usage</th><th>Status</th></tr></thead>
                      <tbody>
                        {report.budgets.map((b) => (
                          <tr key={b.id}>
                            <td><CategoryDot colour={b.colour} name={b.category} /></td>
                            <td className="num">{money(b.limit_amount)}</td>
                            <td className="num">{money(b.spent)}</td>
                            <td className={`num ${b.remaining < 0 ? "neg" : ""}`}>{money(b.remaining)}</td>
                            <td className="usage-cell"><ProgressBar value={b.usage_percentage} status={b.status} /><small>{b.usage_percentage}%</small></td>
                            <td><StatusBadge status={b.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="panel flush">
                <div className="panel-head pad">
                  <h2>Transaction summary</h2>
                  <span className="muted">{showAll ? `All ${report.transactions.length}` : `Latest ${txs.length} of ${report.transactions.length}`}</span>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Payment</th><th>Note</th><th className="num">Amount</th></tr></thead>
                    <tbody>
                      {txs.map((t) => (
                        <tr key={t.id}>
                          <td className="nowrap">{formatDate(t.date)}</td>
                          <td><TypeBadge type={t.type} /></td>
                          <td><CategoryDot colour={t.category_colour} name={t.category} /></td>
                          <td>{t.payment_method}</td>
                          <td className="note-cell">{t.note || <span className="muted">—</span>}</td>
                          <td className={`num amount ${t.type}`}>{t.type === "income" ? "+" : "−"} {money(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {report.transactions.length > 15 && (
                  <div className="pager">
                    <button className="btn ghost sm" onClick={() => setShowAll((v) => !v)}>
                      {showAll ? "Show latest 15" : `Show all ${report.transactions.length} transactions`}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

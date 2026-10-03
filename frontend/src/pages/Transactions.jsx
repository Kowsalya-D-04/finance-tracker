import { useEffect, useMemo, useState } from "react";
import api from "../api";
import Icon from "../components/Icon";
import { ConfirmDialog } from "../components/Modal";
import { CategoryDot, EmptyState, Loader, PageHeader, TypeBadge } from "../components/UI";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { PAYMENT_METHODS, errorMessage, formatDate, formatMoney } from "../utils/format";

const EMPTY_FILTERS = { search: "", type: "", category_id: "", payment_method: "", start_date: "", end_date: "" };

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "category", label: "Category" },
  { key: "amount", label: "Amount", num: true },
  { key: "payment_method", label: "Payment method" },
  { key: null, label: "Note" },
];

export default function Transactions() {
  const { currency } = useAuth();
  const { dataVersion, dataChanged, openTransaction, toast } = useApp();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ by: "date", dir: "desc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [result, setResult] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data.categories)).catch(() => {});
  }, [dataVersion]);

  // Debounce the search box so the API is not called on every keystroke
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, search })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = { ...filters, sort_by: sort.by, sort_dir: sort.dir, page, per_page: perPage };
    Object.keys(params).forEach((k) => params[k] === "" && delete params[k]);
    api.get("/transactions", { params })
      .then((r) => setResult(r.data))
      .catch((err) => toast(errorMessage(err), "error"))
      .finally(() => setLoading(false));
  }, [filters, sort, page, perPage, dataVersion, toast]);

  const setFilter = (key) => (e) => {
    const value = e.target.value;
    setFilters((f) => ({ ...f, [key]: value, ...(key === "type" ? { category_id: "" } : {}) }));
    setPage(1);
  };

  const clearFilters = () => { setFilters(EMPTY_FILTERS); setSearch(""); setPage(1); };
  const activeFilters = Object.entries(filters).filter(([, v]) => v !== "").length;

  const categoryOptions = useMemo(
    () => categories.filter((c) => !filters.type || c.type === filters.type),
    [categories, filters.type],
  );

  const toggleSort = (key) => {
    if (!key) return;
    setSort((s) => ({ by: key, dir: s.by === key && s.dir === "desc" ? "asc" : "desc" }));
    setPage(1);
  };

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

  const money = (v) => formatMoney(v, currency);
  const summary = result?.summary;
  const pg = result?.pagination;

  return (
    <>
      <PageHeader title="Transactions" subtitle="Search, filter and sort every income and expense entry.">
        <button className="btn income-btn" onClick={() => openTransaction(null, "income")}><Icon name="plus" size={16} /> Add income</button>
        <button className="btn primary" onClick={() => openTransaction(null, "expense")}><Icon name="plus" size={16} /> Add expense</button>
      </PageHeader>

      <div className="panel filters">
        <div className="search-box">
          <Icon name="search" size={16} />
          <input type="search" placeholder="Search notes, categories or payment methods" value={search}
            onChange={(e) => setSearch(e.target.value)} aria-label="Search transactions" />
        </div>
        <div className="filter-grid">
          <label>Type
            <select value={filters.type} onChange={setFilter("type")}>
              <option value="">All</option><option value="income">Income</option><option value="expense">Expense</option>
            </select>
          </label>
          <label>Category
            <select value={filters.category_id} onChange={setFilter("category_id")}>
              <option value="">All categories</option>
              {categoryOptions.map((c) => <option key={c.id} value={c.id}>{c.name}{filters.type ? "" : ` (${c.type})`}</option>)}
            </select>
          </label>
          <label>Payment method
            <select value={filters.payment_method} onChange={setFilter("payment_method")}>
              <option value="">All methods</option>
              {PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label>From
            <input type="date" value={filters.start_date} onChange={setFilter("start_date")} max={filters.end_date || undefined} />
          </label>
          <label>To
            <input type="date" value={filters.end_date} onChange={setFilter("end_date")} min={filters.start_date || undefined} />
          </label>
          <button className="btn ghost" onClick={clearFilters} disabled={!activeFilters}>
            Clear{activeFilters ? ` (${activeFilters})` : ""}
          </button>
        </div>
      </div>

      {summary && (
        <div className="summary-strip">
          <span><small>Matching</small><b>{summary.count}</b></span>
          <span><small>Income</small><b className="income">{money(summary.income)}</b></span>
          <span><small>Expenses</small><b className="expense">{money(summary.expense)}</b></span>
          <span><small>Net</small><b className={summary.net < 0 ? "expense" : ""}>{money(summary.net)}</b></span>
        </div>
      )}

      <div className="panel flush">
        {!result && loading ? <Loader /> : result.transactions.length === 0 ? (
          <EmptyState
            icon="transactions"
            title={activeFilters ? "No transactions match these filters" : "No transactions yet"}
            text={activeFilters ? "Try a wider date range or clear the filters." : "Add your income and expenses to start tracking."}
            action={activeFilters
              ? <button className="btn ghost" onClick={clearFilters}>Clear filters</button>
              : <button className="btn primary" onClick={() => openTransaction()}>Add transaction</button>}
          />
        ) : (
          <div className={`table-wrap ${loading ? "is-loading" : ""}`}>
            <table className="table">
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.label} className={c.num ? "num" : ""}
                      aria-sort={sort.by === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                      {c.key ? (
                        <button className={`sort-btn ${sort.by === c.key ? "on" : ""}`} onClick={() => toggleSort(c.key)}>
                          {c.label}
                          <Icon name={sort.by === c.key ? (sort.dir === "asc" ? "up" : "down") : "sort"} size={12} strokeWidth={2.4} />
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="nowrap">{formatDate(t.date)}</td>
                    <td><TypeBadge type={t.type} /></td>
                    <td><CategoryDot colour={t.category_colour} name={t.category} /></td>
                    <td className={`num amount ${t.type}`}>{t.type === "income" ? "+" : "−"} {money(t.amount)}</td>
                    <td>{t.payment_method}</td>
                    <td className="note-cell">{t.note || <span className="muted">—</span>}</td>
                    <td className="row-actions">
                      <button className="icon-btn" onClick={() => openTransaction(t)} aria-label={`Edit ${t.category} transaction`}>
                        <Icon name="edit" size={16} />
                      </button>
                      <button className="icon-btn danger" onClick={() => setToDelete(t)} aria-label={`Delete ${t.category} transaction`}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pg && pg.total > 0 && (
          <div className="pager">
            <span className="muted">
              Showing {(pg.page - 1) * pg.per_page + 1}–{Math.min(pg.page * pg.per_page, pg.total)} of {pg.total}
            </span>
            <div className="pager-controls">
              <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} aria-label="Rows per page">
                {[10, 15, 25, 50, 100].map((n) => <option key={n} value={n}>{n} per page</option>)}
              </select>
              <button className="btn ghost sm" disabled={pg.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="page-no">Page {pg.page} of {pg.pages}</span>
              <button className="btn ghost sm" disabled={pg.page >= pg.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)} title="Delete transaction?" busy={deleting}
        message={toDelete ? `This removes the ${toDelete.type} of ${money(toDelete.amount)} (${toDelete.category}) dated ${formatDate(toDelete.date)}. This cannot be undone.` : ""}
        onCancel={() => setToDelete(null)} onConfirm={confirmDelete}
      />
    </>
  );
}

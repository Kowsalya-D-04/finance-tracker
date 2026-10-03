import { useEffect, useMemo, useState } from "react";
import api from "../api";
import Icon from "../components/Icon";
import Modal, { ConfirmDialog } from "../components/Modal";
import { BudgetUsageChart } from "../components/Charts";
import { CategoryDot, EmptyState, Field, Loader, PageHeader, ProgressBar, StatusBadge } from "../components/UI";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { MONTHS, errorMessage, fieldErrors, formatMoney, yearOptions } from "../utils/format";

export default function Budgets() {
  const { currency } = useAuth();
  const { dataVersion, dataChanged, toast } = useApp();
  const now = new Date();
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    api.get("/budgets", { params: period }).then((r) => setData(r.data))
      .catch((err) => toast(errorMessage(err), "error"));
  }, [period, dataVersion, toast]);

  useEffect(() => {
    api.get("/categories", { params: { type: "expense" } }).then((r) => setCategories(r.data.categories)).catch(() => {});
  }, [dataVersion]);

  const shift = (delta) => setPeriod(({ month, year }) => {
    const idx = year * 12 + (month - 1) + delta;
    return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
  });

  const usedCategoryIds = useMemo(() => new Set((data?.budgets || []).map((b) => b.category_id)), [data]);

  const openNew = () => {
    setForm({ category_id: "", limit_amount: "", alert_threshold: 80, ...period });
    setErrors({});
    setEditing({});
  };
  const openEdit = (b) => {
    setForm({ category_id: String(b.category_id), limit_amount: String(b.limit_amount),
      alert_threshold: b.alert_threshold, month: b.month, year: b.year });
    setErrors({});
    setEditing(b);
  };

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.category_id) errs.category_id = "Choose a category.";
    if (!(Number(form.limit_amount) > 0)) errs.limit_amount = "Enter a limit greater than zero.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { ...form, category_id: Number(form.category_id), limit_amount: Number(form.limit_amount),
        alert_threshold: Number(form.alert_threshold) };
      const res = editing.id ? await api.put(`/budgets/${editing.id}`, payload) : await api.post("/budgets", payload);
      toast(res.data.message);
      setEditing(null);
      setPeriod({ month: payload.month, year: payload.year });
      dataChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/budgets/${toDelete.id}`);
      toast("Budget deleted.");
      dataChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setToDelete(null);
    }
  };

  const copyPrevious = async () => {
    try {
      const res = await api.post("/budgets/copy-previous", period);
      toast(res.data.message);
      dataChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const money = (v) => formatMoney(v, currency);
  const s = data?.summary;

  return (
    <>
      <PageHeader title="Budgets" subtitle="Set a monthly spending limit for each expense category.">
        <button className="btn ghost" onClick={copyPrevious}><Icon name="copy" size={16} /> Copy last month</button>
        <button className="btn primary" onClick={openNew}><Icon name="plus" size={16} /> New budget</button>
      </PageHeader>

      <div className="month-nav">
        <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous month"><Icon name="down" className="rot90" /></button>
        <select value={period.month} onChange={(e) => setPeriod({ ...period, month: Number(e.target.value) })} aria-label="Month">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select value={period.year} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })} aria-label="Year">
          {yearOptions().map((y) => <option key={y}>{y}</option>)}
        </select>
        <button className="icon-btn" onClick={() => shift(1)} aria-label="Next month"><Icon name="up" className="rot90" /></button>
      </div>

      {!data ? <Loader /> : (
        <>
          {data.budgets.length > 0 && (
            <div className="summary-strip">
              <span><small>Total budget</small><b>{money(s.total_limit)}</b></span>
              <span><small>Spent</small><b className="expense">{money(s.total_spent)}</b></span>
              <span><small>Remaining</small><b className={s.total_remaining < 0 ? "expense" : "income"}>{money(s.total_remaining)}</b></span>
              <span><small>Overall usage</small><b>{s.usage_percentage}%</b></span>
              <span><small>Needs attention</small><b>{s.exceeded} exceeded · {s.near_limit} near limit</b></span>
            </div>
          )}

          {data.budgets.length === 0 ? (
            <div className="panel">
              <EmptyState icon="budget" title={`No budgets for ${MONTHS[period.month - 1]} ${period.year}`}
                text="Create a budget, or copy last month's limits in one click."
                action={<button className="btn primary" onClick={openNew}>New budget</button>} />
            </div>
          ) : (
            <div className="grid-main">
              <div className="panel flush">
                <div className="table-wrap">
                  <table className="table budgets-table">
                    <thead>
                      <tr><th>Category</th><th className="num">Limit</th><th className="num">Spent</th>
                        <th className="num">Remaining</th><th>Usage</th><th>Status</th><th className="actions-col">Actions</th></tr>
                    </thead>
                    <tbody>
                      {data.budgets.map((b) => (
                        <tr key={b.id}>
                          <td><CategoryDot colour={b.colour} name={b.category} /></td>
                          <td className="num">{money(b.limit_amount)}</td>
                          <td className="num">{money(b.spent)}</td>
                          <td className={`num ${b.remaining < 0 ? "neg" : ""}`}>{money(b.remaining)}</td>
                          <td className="usage-cell">
                            <ProgressBar value={b.usage_percentage} status={b.status} />
                            <small>{b.usage_percentage}% · alert at {b.alert_threshold}%</small>
                          </td>
                          <td><StatusBadge status={b.status} /></td>
                          <td className="row-actions">
                            <button className="icon-btn" onClick={() => openEdit(b)} aria-label={`Edit ${b.category} budget`}><Icon name="edit" size={16} /></button>
                            <button className="icon-btn danger" onClick={() => setToDelete(b)} aria-label={`Delete ${b.category} budget`}><Icon name="trash" size={16} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="panel">
                <div className="panel-head"><h2>Usage by category</h2></div>
                <BudgetUsageChart data={data.budgets} currency={currency} />
                <p className="muted small">Usage = category expenses this month ÷ budget limit × 100. The dashed line marks the limit.</p>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={editing !== null} onClose={() => setEditing(null)} width={480}
        title={editing?.id ? `Edit ${editing.category} budget` : "New budget"}
        footer={(
          <>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" form="budget-form" disabled={saving}>{saving ? "Saving…" : "Save budget"}</button>
          </>
        )}
      >
        <form id="budget-form" onSubmit={save} noValidate className="stack">
          <Field label="Category" error={errors.category_id} htmlFor="b-cat">
            <select id="b-cat" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">Select an expense category</option>
              {categories.map((c) => {
                const taken = usedCategoryIds.has(c.id) && String(c.id) !== String(editing?.category_id)
                  && form.month === period.month && form.year === period.year;
                return <option key={c.id} value={c.id} disabled={taken}>{c.name}{taken ? " (already set)" : ""}</option>;
              })}
            </select>
          </Field>
          <div className="form-row">
            <Field label="Month" error={errors.month}>
              <select value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Year" error={errors.year}>
              <select value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}>
                {yearOptions().map((y) => <option key={y}>{y}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Budget limit" error={errors.limit_amount} htmlFor="b-limit">
            <input id="b-limit" type="number" min="1" step="0.01" inputMode="decimal" placeholder="8000"
              value={form.limit_amount} onChange={(e) => setForm({ ...form, limit_amount: e.target.value })} />
          </Field>
          <Field label={`Warn me at ${form.alert_threshold}% of the limit`} error={errors.alert_threshold}
            hint={Number(form.limit_amount) > 0 ? `A warning is sent once spending reaches ${money(form.limit_amount * form.alert_threshold / 100)}.` : undefined}>
            <input type="range" min="50" max="100" step="5" value={form.alert_threshold}
              onChange={(e) => setForm({ ...form, alert_threshold: Number(e.target.value) })} />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)} title="Delete budget?"
        message={toDelete ? `The ${toDelete.category} budget for ${toDelete.period} will be removed. Your transactions are not affected.` : ""}
        onCancel={() => setToDelete(null)} onConfirm={remove}
      />
    </>
  );
}

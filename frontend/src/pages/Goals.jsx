import { useEffect, useState } from "react";
import api from "../api";
import Icon from "../components/Icon";
import Modal, { ConfirmDialog } from "../components/Modal";
import { EmptyState, Field, Loader, PageHeader, ProgressBar, StatusBadge } from "../components/UI";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { errorMessage, fieldErrors, formatDate, formatMoney, todayISO } from "../utils/format";

const GOAL_TYPES = ["Emergency Fund", "New Laptop", "Bike", "Vacation", "Education", "House", "Other"];

function Ring({ value, done }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, value);
  return (
    <svg className={`ring ${done ? "done" : ""}`} width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
      <circle cx="38" cy="38" r={r} className="ring-track" />
      <circle cx="38" cy="38" r={r} className="ring-fill" strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
        transform="rotate(-90 38 38)" />
      <text x="38" y="42" textAnchor="middle">{Math.round(value)}%</text>
    </svg>
  );
}

export default function Goals() {
  const { currency } = useAuth();
  const { dataVersion, dataChanged, toast } = useApp();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [contrib, setContrib] = useState(null); // { goal, withdraw }
  const [contribForm, setContribForm] = useState({ amount: "", date: todayISO(), note: "" });
  const [history, setHistory] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    api.get("/goals").then((r) => setData(r.data)).catch((err) => toast(errorMessage(err), "error"));
  }, [dataVersion, toast]);

  const money = (v) => formatMoney(v, currency);

  const openNew = () => {
    setForm({ title: "", goal_type: "Emergency Fund", target_amount: "", saved_amount: "", target_date: "" });
    setErrors({});
    setEditing({});
  };
  const openEdit = (g) => {
    setForm({ title: g.title, goal_type: g.goal_type, target_amount: String(g.target_amount), target_date: g.target_date || "" });
    setErrors({});
    setEditing(g);
  };

  const saveGoal = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.title.trim().length < 2) errs.title = "Give the goal a name.";
    if (!(Number(form.target_amount) > 0)) errs.target_amount = "Enter a target greater than zero.";
    if (form.saved_amount && Number(form.saved_amount) < 0) errs.saved_amount = "Cannot be negative.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { ...form, target_amount: Number(form.target_amount), target_date: form.target_date || null };
      if (!editing.id) payload.saved_amount = Number(form.saved_amount || 0);
      const res = editing.id ? await api.put(`/goals/${editing.id}`, payload) : await api.post("/goals", payload);
      toast(res.data.message);
      setEditing(null);
      dataChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const openContrib = (goal, withdraw = false) => {
    setContribForm({ amount: "", date: todayISO(), note: "" });
    setErrors({});
    setContrib({ goal, withdraw });
  };

  const saveContrib = async (e) => {
    e.preventDefault();
    if (!(Number(contribForm.amount) > 0)) { setErrors({ amount: "Enter an amount greater than zero." }); return; }
    setSaving(true);
    try {
      const res = await api.post(`/goals/${contrib.goal.id}/contributions`, {
        ...contribForm, amount: Number(contribForm.amount), withdraw: contrib.withdraw });
      toast(res.data.message);
      setContrib(null);
      dataChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (goal) => {
    try {
      const res = await api.get(`/goals/${goal.id}`);
      setHistory(res.data.goal);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeEntry = async (entry) => {
    try {
      const res = await api.delete(`/goals/${history.id}/contributions/${entry.id}`);
      setHistory(res.data.goal);
      toast(res.data.message);
      dataChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  const removeGoal = async () => {
    try {
      await api.delete(`/goals/${toDelete.id}`);
      toast("Goal deleted.");
      dataChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setToDelete(null);
    }
  };

  if (!data) return <Loader />;
  const s = data.summary;

  return (
    <>
      <PageHeader title="Savings goals" subtitle="Save towards specific targets and track how close you are.">
        <button className="btn primary" onClick={openNew}><Icon name="plus" size={16} /> New goal</button>
      </PageHeader>

      {data.goals.length > 0 && (
        <div className="summary-strip">
          <span><small>Total target</small><b>{money(s.total_target)}</b></span>
          <span><small>Saved so far</small><b className="income">{money(s.total_saved)}</b></span>
          <span><small>Still to save</small><b>{money(s.total_remaining)}</b></span>
          <span><small>Overall progress</small><b>{s.overall_progress}%</b></span>
          <span><small>Goals</small><b>{s.active} active · {s.completed} completed</b></span>
        </div>
      )}

      {data.goals.length === 0 ? (
        <div className="panel">
          <EmptyState icon="goal" title="No savings goals yet"
            text="An emergency fund of three to six months of expenses is a common first goal."
            action={<button className="btn primary" onClick={openNew}>Create a goal</button>} />
        </div>
      ) : (
        <div className="goal-grid">
          {data.goals.map((g) => (
            <article key={g.id} className={`goal-card ${g.status === "Completed" ? "is-done" : ""}`}>
              <header>
                <div>
                  <h2>{g.title}</h2>
                  {g.goal_type !== g.title && <small className="muted">{g.goal_type}</small>}
                </div>
                <StatusBadge status={g.status} />
              </header>
              <div className="goal-body">
                <Ring value={g.progress_percentage} done={g.status === "Completed"} />
                <dl>
                  <div><dt>Saved</dt><dd className="income">{money(g.saved_amount)}</dd></div>
                  <div><dt>Target</dt><dd>{money(g.target_amount)}</dd></div>
                  <div><dt>Remaining</dt><dd>{money(g.remaining)}</dd></div>
                </dl>
              </div>
              <ProgressBar value={g.progress_percentage} status={g.status === "Completed" ? "Completed" : ""} />
              <p className="goal-meta">
                {g.target_date ? (
                  <>Target date {formatDate(g.target_date)}
                    {g.status === "In Progress" && g.days_left !== null && <> · {g.days_left} days left</>}
                    {g.status === "Overdue" && <> · target date has passed</>}
                  </>
                ) : "No target date"}
                {g.monthly_needed ? <><br />Save about {formatMoney(Math.ceil(g.monthly_needed), currency)} a month to finish on time.</> : null}
              </p>
              <footer>
                {g.status !== "Completed" && (
                  <button className="btn primary sm" onClick={() => openContrib(g)}><Icon name="plus" size={14} /> Add money</button>
                )}
                <button className="btn ghost sm" onClick={() => openContrib(g, true)} disabled={g.saved_amount <= 0}>Withdraw</button>
                <button className="btn ghost sm" onClick={() => openHistory(g)}>History</button>
                <span className="spacer" />
                <button className="icon-btn" onClick={() => openEdit(g)} aria-label={`Edit ${g.title}`}><Icon name="edit" size={16} /></button>
                <button className="icon-btn danger" onClick={() => setToDelete(g)} aria-label={`Delete ${g.title}`}><Icon name="trash" size={16} /></button>
              </footer>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null} onClose={() => setEditing(null)} width={480}
        title={editing?.id ? `Edit ${editing.title}` : "New savings goal"}
        footer={(
          <>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" form="goal-form" disabled={saving}>{saving ? "Saving…" : "Save goal"}</button>
          </>
        )}
      >
        <form id="goal-form" onSubmit={saveGoal} noValidate className="stack">
          <Field label="Goal type" error={errors.goal_type}>
            <div className="chip-group">
              {GOAL_TYPES.map((t) => (
                <button key={t} type="button" className={`chip ${form.goal_type === t ? "active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, goal_type: t, title: !f.title || GOAL_TYPES.includes(f.title) ? (t === "Other" ? "" : t) : f.title }))}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Goal title" error={errors.title} htmlFor="g-title">
            <input id="g-title" maxLength={100} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Emergency Fund" />
          </Field>
          <div className="form-row">
            <Field label="Target amount" error={errors.target_amount} htmlFor="g-target">
              <input id="g-target" type="number" min="1" step="0.01" inputMode="decimal" value={form.target_amount}
                onChange={(e) => setForm({ ...form, target_amount: e.target.value })} placeholder="100000" />
            </Field>
            {!editing?.id && (
              <Field label="Already saved" error={errors.saved_amount} htmlFor="g-saved">
                <input id="g-saved" type="number" min="0" step="0.01" inputMode="decimal" value={form.saved_amount}
                  onChange={(e) => setForm({ ...form, saved_amount: e.target.value })} placeholder="0" />
              </Field>
            )}
          </div>
          <Field label="Target date (optional)" error={errors.target_date} htmlFor="g-date">
            <input id="g-date" type="date" min={editing?.id ? undefined : todayISO()} value={form.target_date}
              onChange={(e) => setForm({ ...form, target_date: e.target.value })} />
          </Field>
        </form>
      </Modal>

      <Modal
        open={Boolean(contrib)} onClose={() => setContrib(null)} width={420}
        title={contrib ? `${contrib.withdraw ? "Withdraw from" : "Add money to"} ${contrib.goal.title}` : ""}
        footer={(
          <>
            <button className="btn ghost" onClick={() => setContrib(null)}>Cancel</button>
            <button className={`btn ${contrib?.withdraw ? "danger" : "primary"}`} form="contrib-form" disabled={saving}>
              {saving ? "Saving…" : contrib?.withdraw ? "Withdraw" : "Add money"}
            </button>
          </>
        )}
      >
        {contrib && (
          <form id="contrib-form" onSubmit={saveContrib} noValidate className="stack">
            <p className="muted small">
              Saved {money(contrib.goal.saved_amount)} of {money(contrib.goal.target_amount)}.
              {!contrib.withdraw && contrib.goal.remaining > 0 && <> {money(contrib.goal.remaining)} to go.</>}
            </p>
            <Field label="Amount" error={errors.amount} htmlFor="c-amount">
              <input id="c-amount" className="amount-input" type="number" min="0.01" step="0.01" inputMode="decimal"
                value={contribForm.amount} onChange={(e) => setContribForm({ ...contribForm, amount: e.target.value })} />
            </Field>
            {!contrib.withdraw && contrib.goal.remaining > 0 && (
              <button type="button" className="demo-link left"
                onClick={() => setContribForm({ ...contribForm, amount: String(contrib.goal.remaining) })}>
                Fill the remaining {money(contrib.goal.remaining)}
              </button>
            )}
            <div className="form-row">
              <Field label="Date" error={errors.date}>
                <input type="date" value={contribForm.date} onChange={(e) => setContribForm({ ...contribForm, date: e.target.value })} />
              </Field>
              <Field label="Note (optional)">
                <input maxLength={255} value={contribForm.note} onChange={(e) => setContribForm({ ...contribForm, note: e.target.value })} />
              </Field>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(history)} onClose={() => setHistory(null)} title={history ? `${history.title} history` : ""} width={520}>
        {history && (history.contributions.length === 0 ? <p className="muted">No entries yet.</p> : (
          <ul className="history-list">
            {history.contributions.map((c) => (
              <li key={c.id}>
                <span>{formatDate(c.date)}<small>{c.note || (c.amount < 0 ? "Withdrawal" : "Contribution")}</small></span>
                <b className={c.amount < 0 ? "expense" : "income"}>{c.amount < 0 ? "−" : "+"} {money(Math.abs(c.amount))}</b>
                <button className="icon-btn danger" onClick={() => removeEntry(c)} aria-label="Remove entry"><Icon name="trash" size={15} /></button>
              </li>
            ))}
          </ul>
        ))}
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)} title="Delete goal?"
        message={toDelete ? `${toDelete.title} and its ${money(toDelete.saved_amount)} of saved history will be removed.` : ""}
        onCancel={() => setToDelete(null)} onConfirm={removeGoal}
      />
    </>
  );
}

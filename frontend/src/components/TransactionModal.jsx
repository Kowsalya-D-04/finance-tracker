import { useEffect, useState } from "react";
import api from "../api";
import Modal from "./Modal";
import { Field } from "./UI";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { PAYMENT_METHODS, todayISO, errorMessage, fieldErrors, formatMoney } from "../utils/format";

const blank = (type) => ({ type, amount: "", category_id: "", date: todayISO(), payment_method: "UPI", note: "" });

// Add / edit transaction dialog. Opened from anywhere via useApp().openTransaction().
export default function TransactionModal() {
  const { txModal, closeTransaction, dataChanged, toast } = useApp();
  const { currency } = useAuth();
  const { open, transaction, defaultType } = txModal;
  const editing = Boolean(transaction);

  const [form, setForm] = useState(blank("expense"));
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [mlSuggestion, setMlSuggestion] = useState(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setMlSuggestion(null);
    setForm(transaction
      ? { type: transaction.type, amount: String(transaction.amount), category_id: String(transaction.category_id),
          date: transaction.date, payment_method: transaction.payment_method, note: transaction.note || "" }
      : blank(defaultType || "expense"));
    api.get("/categories").then((r) => setCategories(r.data.categories)).catch(() => {});
  }, [open, transaction, defaultType]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setType = (type) => { setMlSuggestion(null); setForm((f) => ({ ...f, type, category_id: "" })); };
  const options = categories.filter((c) => c.type === form.type);

  const suggestCategory = async () => {
    if (form.type !== "expense" || form.note.trim().length < 2) return;
    setPredicting(true);
    try {
      const res = await api.post("/ml/predict-category", { description: form.note });
      const result = res.data;
      setMlSuggestion(result);
      if (result.available) {
        const match = categories.find((c) => c.type === "expense" && c.name === result.predicted_category);
        if (match) setForm((f) => ({ ...f, category_id: String(match.id) }));
      }
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setPredicting(false);
    }
  };

  const validate = () => {
    const e = {};
    const amount = Number(form.amount);
    if (!form.amount || Number.isNaN(amount) || amount <= 0) e.amount = "Enter an amount greater than zero.";
    if (!form.category_id) e.category_id = "Choose a category.";
    if (!form.date) e.date = "Date is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount), category_id: Number(form.category_id) };
      const res = editing
        ? await api.put(`/transactions/${transaction.id}`, payload)
        : await api.post("/transactions", payload);
      toast(res.data.message);
      dataChanged();
      closeTransaction();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open} onClose={closeTransaction} title={editing ? "Edit transaction" : "Add transaction"}
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={closeTransaction}>Cancel</button>
          <button type="submit" form="tx-form" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : `Save ${form.type}`}
          </button>
        </>
      )}
    >
      <form id="tx-form" onSubmit={submit} noValidate>
        <div className="segmented" role="radiogroup" aria-label="Transaction type">
          {["expense", "income"].map((t) => (
            <button
              key={t} type="button" role="radio" aria-checked={form.type === t}
              className={`seg ${t} ${form.type === t ? "active" : ""}`} onClick={() => setType(t)}
            >
              {t === "income" ? "Income" : "Expense"}
            </button>
          ))}
        </div>

        <Field label="Amount" error={errors.amount} htmlFor="tx-amount"
          hint={form.amount > 0 ? formatMoney(form.amount, currency, { decimals: 2 }) : undefined}>
          <input id="tx-amount" className="amount-input" type="number" inputMode="decimal" min="0.01" step="0.01"
            placeholder="0.00" value={form.amount} onChange={set("amount")} />
        </Field>

        <div className="form-row">
          <Field label="Category" error={errors.category_id} htmlFor="tx-cat">
            <select id="tx-cat" value={form.category_id} onChange={set("category_id")}>
              <option value="">Select a category</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Date" error={errors.date} htmlFor="tx-date">
            <input id="tx-date" type="date" value={form.date} max="2100-12-31" onChange={set("date")} />
          </Field>
        </div>

        <Field label="Payment method" error={errors.payment_method}>
          <div className="chip-group">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" className={`chip ${form.payment_method === m ? "active" : ""}`}
                onClick={() => setForm((f) => ({ ...f, payment_method: m }))} aria-pressed={form.payment_method === m}>
                {m}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Note (optional)" error={errors.note} htmlFor="tx-note">
          <input id="tx-note" type="text" maxLength={255} placeholder="e.g. Groceries for the week"
            value={form.note} onChange={(e) => { setMlSuggestion(null); set("note")(e); }} />
        </Field>

        {form.type === "expense" && (
          <div className="ml-inline-suggest">
            <button type="button" className="btn ghost" disabled={predicting || form.note.trim().length < 2} onClick={suggestCategory}>
              {predicting ? "Predicting…" : "Suggest category with ML"}
            </button>
            {mlSuggestion?.available && (
              <span><strong>{mlSuggestion.predicted_category}</strong> · {mlSuggestion.confidence}% confidence</span>
            )}
            {mlSuggestion && !mlSuggestion.available && <span>{mlSuggestion.message}</span>}
          </div>
        )}
      </form>
    </Modal>
  );
}

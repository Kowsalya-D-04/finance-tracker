import { useEffect, useState } from "react";
import api from "../api";
import Icon from "../components/Icon";
import Modal, { ConfirmDialog } from "../components/Modal";
import { Field, Loader, PageHeader } from "../components/UI";
import { useApp } from "../context/AppContext";
import { errorMessage, fieldErrors } from "../utils/format";

const SWATCHES = ["#1F7A5C", "#2F9E78", "#2E86C1", "#5B7FC7", "#6D5BD0", "#9B59B6", "#C2528B", "#D2455A",
  "#B5473A", "#E07A2E", "#D9A21B", "#7A5230", "#17A2A2", "#4E9A6B", "#8C9590", "#34495E"];

const blank = (type = "expense") => ({ name: "", type, colour: SWATCHES[0] });

export default function Categories() {
  const { dataVersion, dataChanged, toast } = useApp();
  const [categories, setCategories] = useState(null);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, category = edit
  const [form, setForm] = useState(blank());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data.categories))
      .catch((err) => toast(errorMessage(err), "error"));
  }, [dataVersion, toast]);

  const openNew = (type) => { setForm(blank(type)); setErrors({}); setEditing({}); };
  const openEdit = (c) => { setForm({ name: c.name, type: c.type, colour: c.colour }); setErrors({}); setEditing(c); };

  const save = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) { setErrors({ name: "Enter at least 2 characters." }); return; }
    setSaving(true);
    try {
      const res = editing.id
        ? await api.put(`/categories/${editing.id}`, form)
        : await api.post("/categories", form);
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

  const remove = async () => {
    try {
      await api.delete(`/categories/${toDelete.id}`);
      toast("Category deleted.");
      dataChanged();
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setToDelete(null);
    }
  };

  if (!categories) return <Loader />;

  const renderList = (type) => {
    const list = categories.filter((c) => c.type === type);
    return (
      <div className="panel">
        <div className="panel-head">
          <h2>{type === "income" ? "Income categories" : "Expense categories"} <span className="count">{list.length}</span></h2>
          <button className="btn ghost sm" onClick={() => openNew(type)}><Icon name="plus" size={14} /> Add</button>
        </div>
        <ul className="cat-list">
          {list.map((c) => (
            <li key={c.id}>
              <span className="cat-swatch" style={{ background: c.colour }} />
              <span className="cat-name">
                {c.name}
                <small>{c.is_default ? "Default" : "Custom"} · {c.usage_count} transaction{c.usage_count === 1 ? "" : "s"}</small>
              </span>
              <span className="row-actions">
                <button className="icon-btn" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}><Icon name="edit" size={16} /></button>
                {!c.is_default && (
                  <button className="icon-btn danger" onClick={() => setToDelete(c)} aria-label={`Delete ${c.name}`}
                    disabled={c.usage_count > 0} title={c.usage_count > 0 ? "In use by transactions" : "Delete"}>
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const isDefault = editing?.is_default;

  return (
    <>
      <PageHeader title="Categories" subtitle="Default categories are ready to use. Add your own for anything else.">
        <button className="btn primary" onClick={() => openNew("expense")}><Icon name="plus" size={16} /> New category</button>
      </PageHeader>

      <div className="grid-2">
        {renderList("income")}
        {renderList("expense")}
      </div>

      <Modal
        open={editing !== null} onClose={() => setEditing(null)} width={460}
        title={editing?.id ? `Edit ${editing.name}` : "New category"}
        footer={(
          <>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn primary" form="cat-form" disabled={saving}>{saving ? "Saving…" : "Save category"}</button>
          </>
        )}
      >
        <form id="cat-form" onSubmit={save} noValidate className="stack">
          {isDefault && <p className="muted small">Default categories keep their name and type. You can change the colour.</p>}
          <Field label="Category name" error={errors.name} htmlFor="cat-name">
            <input id="cat-name" maxLength={50} value={form.name} disabled={isDefault}
              onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Pets" />
          </Field>
          <Field label="Type" error={errors.type}>
            <div className="segmented">
              {["expense", "income"].map((t) => (
                <button key={t} type="button" disabled={isDefault || (editing?.usage_count > 0)}
                  className={`seg ${t} ${form.type === t ? "active" : ""}`} onClick={() => setForm({ ...form, type: t })}>
                  {t === "income" ? "Income" : "Expense"}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Colour" error={errors.colour}>
            <div className="swatches">
              {SWATCHES.map((s) => (
                <button key={s} type="button" className={`swatch ${form.colour === s ? "on" : ""}`} style={{ background: s }}
                  onClick={() => setForm({ ...form, colour: s })} aria-label={`Colour ${s}`} aria-pressed={form.colour === s} />
              ))}
              <input type="color" value={form.colour} onChange={(e) => setForm({ ...form, colour: e.target.value.toUpperCase() })}
                aria-label="Custom colour" />
            </div>
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)} title="Delete category?"
        message={toDelete ? `${toDelete.name} will be removed, along with any budgets set for it.` : ""}
        onCancel={() => setToDelete(null)} onConfirm={remove}
      />
    </>
  );
}

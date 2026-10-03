import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import Icon from "../components/Icon";
import { Field, Loader, PageHeader } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { CURRENCIES, errorMessage, fieldErrors, formatDate } from "../utils/format";

export default function Profile() {
  const { user, setUser, logout } = useAuth();
  const { toast, dataChanged } = useApp();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ name: user.name, email: user.email, currency: user.currency });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [errors, setErrors] = useState({});
  const [pwErrors, setPwErrors] = useState({});
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.get("/profile").then((r) => setStats(r.data.stats)).catch(() => {});
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setBusy("profile");
    try {
      const res = await api.put("/profile", form);
      setUser(res.data.user);
      setErrors({});
      toast(res.data.message);
      dataChanged();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    if (pw.new_password !== pw.confirm_password) {
      setPwErrors({ confirm_password: "Passwords do not match." });
      return;
    }
    setBusy("password");
    try {
      const res = await api.put("/profile/password", pw);
      setPw({ current_password: "", new_password: "", confirm_password: "" });
      setPwErrors({});
      toast(res.data.message);
    } catch (err) {
      setPwErrors(fieldErrors(err));
      toast(errorMessage(err), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <PageHeader title="Profile" subtitle={`Member since ${formatDate(user.created_at)}`}>
        <button className="btn ghost" onClick={() => { logout(); navigate("/login"); }}>
          <Icon name="logout" size={16} /> Log out
        </button>
      </PageHeader>

      {stats ? (
        <div className="summary-strip">
          <span><small>Transactions</small><b>{stats.transactions}</b></span>
          <span><small>Budgets</small><b>{stats.budgets}</b></span>
          <span><small>Savings goals</small><b>{stats.goals}</b></span>
          <span><small>Categories</small><b>{stats.categories}</b></span>
        </div>
      ) : <Loader />}

      <div className="grid-2">
        <form className="panel stack" onSubmit={saveProfile} noValidate>
          <div className="panel-head"><h2>Account details</h2></div>
          <Field label="Full name" error={errors.name} htmlFor="p-name">
            <input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email" error={errors.email} htmlFor="p-email">
            <input id="p-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Currency" error={errors.currency} htmlFor="p-cur" hint="Changes how amounts are displayed. Stored values are not converted.">
            <select id="p-cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </Field>
          <div><button className="btn primary" disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : "Save changes"}</button></div>
        </form>

        <form className="panel stack" onSubmit={savePassword} noValidate>
          <div className="panel-head"><h2>Change password</h2><Icon name="lock" /></div>
          <Field label="Current password" error={pwErrors.current_password}>
            <input type="password" autoComplete="current-password" value={pw.current_password}
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </Field>
          <Field label="New password" error={pwErrors.new_password} hint="At least 8 characters with upper and lowercase letters and a number.">
            <input type="password" autoComplete="new-password" value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </Field>
          <Field label="Confirm new password" error={pwErrors.confirm_password}>
            <input type="password" autoComplete="new-password" value={pw.confirm_password}
              onChange={(e) => setPw({ ...pw, confirm_password: e.target.value })} />
          </Field>
          <div><button className="btn primary" disabled={busy === "password" || !pw.current_password}>
            {busy === "password" ? "Updating…" : "Update password"}</button></div>
        </form>
      </div>
    </>
  );
}

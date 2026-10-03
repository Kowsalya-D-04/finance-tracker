import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import Icon from "../components/Icon";
import { Field } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { CURRENCIES, errorMessage, fieldErrors } from "../utils/format";

const RULES = [
  { test: (p) => p.length >= 8, label: "8 or more characters" },
  { test: (p) => /[A-Z]/.test(p), label: "An uppercase letter" },
  { test: (p) => /[a-z]/.test(p), label: "A lowercase letter" },
  { test: (p) => /\d/.test(p), label: "A number" },
];

export default function Register() {
  const { register } = useAuth();
  const { toast } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm_password: "", currency: "INR" });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const e = {};
    if (form.name.trim().length < 2) e.name = "Enter your full name.";
    if (!/^\S+@\S+\.\S{2,}$/.test(form.email.trim())) e.email = "Enter a valid email address.";
    const failed = RULES.find((r) => !r.test(form.password));
    if (failed) e.password = `Password needs: ${failed.label.toLowerCase()}.`;
    if (form.password !== form.confirm_password) e.confirm_password = "Passwords do not match.";
    if (!form.currency) e.currency = "Choose a currency.";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setFormError("");
    try {
      await register({ ...form, name: form.name.trim(), email: form.email.trim() });
      toast("Account created. Add your first transaction to get started.");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a minute. Default categories are set up for you."
      footer={<>Already registered? <Link to="/login">Log in</Link></>}
    >
      {formError && <div className="alert danger" role="alert">{formError}</div>}
      <form onSubmit={submit} noValidate className="stack">
        <Field label="Full name" error={errors.name} htmlFor="name">
          <input id="name" autoComplete="name" value={form.name} onChange={set("name")} />
        </Field>
        <Field label="Email" error={errors.email} htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" error={errors.password} htmlFor="password">
          <div className="input-with-btn">
            <input id="password" type={show ? "text" : "password"} autoComplete="new-password"
              value={form.password} onChange={set("password")} />
            <button type="button" className="icon-btn" onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}>
              <Icon name={show ? "eyeOff" : "eye"} />
            </button>
          </div>
        </Field>
        <ul className="pw-rules" aria-label="Password requirements">
          {RULES.map((r) => (
            <li key={r.label} className={r.test(form.password) ? "met" : ""}>
              <Icon name="check" size={13} strokeWidth={2.6} /> {r.label}
            </li>
          ))}
        </ul>
        <Field label="Confirm password" error={errors.confirm_password} htmlFor="confirm">
          <input id="confirm" type={show ? "text" : "password"} autoComplete="new-password"
            value={form.confirm_password} onChange={set("confirm_password")} />
        </Field>
        <Field label="Currency" error={errors.currency} htmlFor="currency">
          <select id="currency" value={form.currency} onChange={set("currency")}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
        <button className="btn primary lg block" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
    </AuthShell>
  );
}

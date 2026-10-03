import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import AuthShell from "./AuthShell";
import Icon from "../components/Icon";
import { Field } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import { errorMessage } from "../utils/format";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(params.get("expired") ? "Your session expired. Please log in again." : "");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "Enter a valid email address.";
    if (!form.password) errs.password = "Enter your password.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    setFormError("");
    try {
      const user = await login(form.email.trim(), form.password, form.remember);
      toast(`Welcome back, ${user.name.split(" ")[0]}.`);
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = () => setForm((f) => ({ ...f, email: "demo@financetracker.com", password: "Demo@1234" }));

  return (
    <AuthShell
      title="Log in"
      subtitle="Pick up where you left off."
      footer={<>New here? <Link to="/register">Create an account</Link></>}
    >
      {formError && <div className="alert danger" role="alert">{formError}</div>}
      <form onSubmit={submit} noValidate className="stack">
        <Field label="Email" error={errors.email} htmlFor="email">
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={set("email")} />
        </Field>
        <Field label="Password" error={errors.password} htmlFor="password">
          <div className="input-with-btn">
            <input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
              value={form.password} onChange={set("password")} />
            <button type="button" className="icon-btn" onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              <Icon name={showPassword ? "eyeOff" : "eye"} />
            </button>
          </div>
        </Field>
        <label className="check">
          <input type="checkbox" checked={form.remember} onChange={set("remember")} />
          <span>Keep me logged in on this device</span>
        </label>
        <button className="btn primary lg block" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      </form>
      <button type="button" className="demo-link" onClick={fillDemo}>
        Use the demo account (demo@financetracker.com)
      </button>
    </AuthShell>
  );
}

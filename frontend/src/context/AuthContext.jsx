import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api, { TOKEN_KEY, getToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  // Restore the session on page refresh.
  useEffect(() => {
    if (!getToken()) return;
    api.get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  const saveSession = useCallback((token, userData, remember = true) => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    // "Remember me" keeps the token after the browser closes; otherwise it lasts for this tab session.
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
    setUser(userData);
  }, []);

  const login = useCallback(async (email, password, remember) => {
    const res = await api.post("/auth/login", { email, password });
    saveSession(res.data.token, res.data.user, remember);
    return res.data.user;
  }, [saveSession]);

  const register = useCallback(async (form) => {
    const res = await api.post("/auth/register", form);
    saveSession(res.data.token, res.data.user, true);
    return res.data.user;
  }, [saveSession]);

  const logout = useCallback(() => {
    api.post("/auth/logout").catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, loading, login, register, logout, currency: user?.currency || "INR" }),
    [user, loading, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../api";
import { useAuth } from "./AuthContext";

// App-wide UI state: toasts, the quick-add transaction modal, unread alerts
// and a "data version" counter that pages watch to refetch after changes.
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { user } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [unread, setUnread] = useState(0);
  const [txModal, setTxModal] = useState({ open: false, transaction: null, defaultType: "expense" });
  const idRef = useRef(0);

  const toast = useCallback((message, tone = "success") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refreshUnread = useCallback(() => {
    if (!user) return;
    api.get("/notifications/unread-count").then((r) => setUnread(r.data.unread_count)).catch(() => {});
  }, [user]);

  // Called after any change to financial data: every open page refetches.
  const dataChanged = useCallback(() => {
    setDataVersion((v) => v + 1);
    refreshUnread();
  }, [refreshUnread]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  const openTransaction = useCallback((transaction = null, defaultType = "expense") => {
    setTxModal({ open: true, transaction, defaultType });
  }, []);
  const closeTransaction = useCallback(() => setTxModal((m) => ({ ...m, open: false })), []);

  const value = useMemo(() => ({
    toast, toasts, dataVersion, dataChanged, unread, setUnread, refreshUnread,
    txModal, openTransaction, closeTransaction,
  }), [toast, toasts, dataVersion, dataChanged, unread, refreshUnread, txModal, openTransaction, closeTransaction]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);

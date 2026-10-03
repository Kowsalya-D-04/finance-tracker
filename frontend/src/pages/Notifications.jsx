import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import Icon from "../components/Icon";
import { EmptyState, Loader, PageHeader } from "../components/UI";
import { useApp } from "../context/AppContext";
import { errorMessage, timeAgo } from "../utils/format";

const KIND = {
  budget_warning: { icon: "alert", label: "Budget warning", link: "/budgets" },
  budget_exceeded: { icon: "alert", label: "Budget exceeded", link: "/budgets" },
  goal_progress: { icon: "goal", label: "Goal progress", link: "/goals" },
  goal_completed: { icon: "check", label: "Goal completed", link: "/goals" },
};

const TABS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "budget", label: "Budgets" },
  { key: "goal", label: "Goals" },
];

export default function Notifications() {
  const { dataVersion, setUnread, toast } = useApp();
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const params = tab === "unread" ? { unread: "true" } : tab === "all" ? {} : { kind: tab };
    api.get("/notifications", { params })
      .then((r) => { setItems(r.data.notifications); setUnread(r.data.unread_count); })
      .catch((err) => toast(errorMessage(err), "error"));
  }, [tab, dataVersion, reload, setUnread, toast]);

  const act = async (request, message) => {
    try {
      const res = await request;
      if (message) toast(message);
      setUnread(res.data.unread_count);
      setReload((n) => n + 1);
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  };

  return (
    <>
      <PageHeader title="Notifications" subtitle="Budget warnings and savings milestones, newest first.">
        <button className="btn ghost" onClick={() => act(api.put("/notifications/read-all"), "All marked as read.")}
          disabled={!items?.some((n) => !n.is_read)}>
          <Icon name="check" size={16} /> Mark all as read
        </button>
        <button className="btn ghost" onClick={() => act(api.delete("/notifications"), "Notifications cleared.")}
          disabled={!items?.length}>
          <Icon name="trash" size={16} /> Clear all
        </button>
      </PageHeader>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="panel flush">
        {!items ? <Loader /> : items.length === 0 ? (
          <EmptyState icon="bell" title={tab === "unread" ? "You're all caught up" : "No notifications"}
            text="Alerts appear when spending reaches a budget's warning level, when a budget is exceeded, and when a savings goal passes 25%, 50%, 75% or 100%." />
        ) : (
          <ul className="notif-list">
            {items.map((n) => {
              const k = KIND[n.kind] || { icon: "bell", label: "Notice", link: "/dashboard" };
              return (
                <li key={n.id} className={`${n.kind} ${n.is_read ? "read" : "unread"}`}>
                  <span className="al-icon"><Icon name={k.icon} size={16} /></span>
                  <div className="notif-body">
                    <div className="notif-top">
                      <strong>{n.title}</strong>
                      <small>{k.label} · {timeAgo(n.created_at)}</small>
                    </div>
                    <p>{n.message}</p>
                    <Link to={k.link} className="link small">Open {k.link === "/budgets" ? "budgets" : "goals"}</Link>
                  </div>
                  <div className="row-actions">
                    {!n.is_read && (
                      <button className="icon-btn" aria-label="Mark as read" title="Mark as read"
                        onClick={() => act(api.put(`/notifications/${n.id}/read`))}><Icon name="check" size={16} /></button>
                    )}
                    <button className="icon-btn danger" aria-label="Remove" title="Remove"
                      onClick={() => act(api.delete(`/notifications/${n.id}`))}><Icon name="trash" size={16} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

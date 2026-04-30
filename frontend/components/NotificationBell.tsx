"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./NotificationBell.css";

type NotifItem = {
  id: number;
  user_id: number;
  group_id?: number | null;
  notification_type: string;
  title: string;
  body: string;
  payload: any;
  is_read: boolean;
  created_at: string | null;
};

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadCounts();
  }, []);

  async function loadCounts() {
    try {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Number(data?.unread_count) || 0);
    } catch {
      // ignore
    }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const [gRes, pRes] = await Promise.all([
        fetch("/api/poll-notifications", { credentials: "include" }),
        fetch("/api/notifications", { credentials: "include" }),
      ]);

      const gData = gRes.ok ? await gRes.json() : { items: [] };
      const pData = pRes.ok ? await pRes.json() : { items: [] };

      // normalize
      const normalized: NotifItem[] = [];
      for (const it of gData.items || []) {
        normalized.push({ ...it, group_id: it.group_id ?? null });
      }
      for (const it of pData.items || []) {
        normalized.push({ ...it, group_id: undefined });
      }

      normalized.sort((a, b) => {
        const da = a.created_at ? Date.parse(a.created_at) : 0;
        const db = b.created_at ? Date.parse(b.created_at) : 0;
        return db - da;
      });

      setItems(normalized.slice(0, 50));
      // recompute unread
      const unread = normalized.reduce((acc, it) => acc + (it.is_read ? 0 : 1), 0);
      setUnreadCount(unread);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await loadItems();
    }
  }

  async function markReadAndRoute(item: NotifItem) {
    try {
      if (item.group_id) {
        await fetch(`/api/poll-notifications/${item.id}/read`, { method: "PATCH", credentials: "include" });
        if (item.payload && item.payload.item_id && item.payload.group_id) {
          router.push(`/group/${item.payload.group_id}/itinerary?itemId=${item.payload.item_id}`);
        } else if (item.payload && item.payload.group_id) {
          router.push(`/group/${item.payload.group_id}`);
        } else {
          router.push(`/group/${String(item.group_id)}`);
        }
      } else {
        await fetch(`/api/notifications/${item.id}/read`, { method: "PATCH", credentials: "include" });
        // route to booking if present
        if (item.payload && (item.payload.booking_reference || item.payload.order_id)) {
          router.push(`/bookings`);
        } else {
          router.push(`/bookings`);
        }
      }
    } catch (e) {
      // ignore
    } finally {
      // refresh the list and counts
      void loadItems();
      void loadCounts();
      setOpen(false);
    }
  }

  return (
    <div className="notification-bell-container">
      <button className="notification-btn" onClick={handleToggle} aria-label="Notifications">
        <img src="/bell.svg" alt="Notifications" className="notification-icon" />
        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">Notifications</div>
          {loading && <div className="notification-loading">Loading…</div>}
          {!loading && items.length === 0 && <div className="notification-empty">No notifications</div>}
          <ul className="notification-list">
            {items.map((it) => (
              <li key={`${it.group_id ?? "p"}-${it.id}`} className={`notification-item ${it.is_read ? "read" : "unread"}`} onClick={() => markReadAndRoute(it)}>
                <div className="notification-title">{it.title}</div>
                <div className="notification-body">{it.body}</div>
                <div className="notification-time">{it.created_at ? new Date(it.created_at).toLocaleString() : ""}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

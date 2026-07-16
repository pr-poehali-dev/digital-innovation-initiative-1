import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "@/components/ui/icon";
import { notificationsApi, type NotificationItem } from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr.replace(" ", "T") + (dateStr.includes("Z") ? "" : "Z")).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days} дн назад`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await notificationsApi.list();
      setItems(data.items);
      setUnreadCount(data.unread_count);
    } catch {
      // тихо игнорируем — не мешаем пользователю
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = async () => {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, is_read: true } : i)));
      setUnreadCount(prev => Math.max(0, prev - 1));
      notificationsApi.markRead(item.id).catch(() => {});
    }
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  const handleMarkAllRead = async () => {
    setItems(prev => prev.map(i => ({ ...i, is_read: true })));
    setUnreadCount(0);
    notificationsApi.markAllRead().catch(() => {});
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleToggle}
        className="relative w-8 h-8 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
        aria-label="Уведомления"
      >
        <Icon name="Bell" size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center text-[9px] font-semibold text-white bg-orange-500 rounded-full leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-900">Уведомления</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-violet-600 hover:text-violet-800 font-medium">
                Прочитать все
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">Загрузка...</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-slate-400">Пока нет уведомлений</div>
            )}
            {!loading && items.map(item => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 last:border-b-0 hover:bg-slate-50 transition-colors flex gap-2 ${
                  !item.is_read ? "bg-violet-50/50" : ""
                }`}
              >
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${!item.is_read ? "bg-orange-500" : "bg-transparent"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-900 leading-snug">{item.title}</span>
                  {item.message && (
                    <span className="block text-xs text-slate-500 mt-0.5 leading-snug line-clamp-2">{item.message}</span>
                  )}
                  <span className="block text-[11px] text-slate-400 mt-1">{timeAgo(item.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

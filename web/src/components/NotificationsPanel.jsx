import React, { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, CheckCircle2, ArrowRight, ExternalLink } from 'lucide-react';
import api from '../api.js';

/**
 * NotificationsPanel — LUMINOUS GLASS Bell Popover (Spec 3.1.7)
 * Popover displaying notification stream, unread indicator, row click mark read,
 * and live empty state (BellOff).
 */
export default function NotificationsPanel({
  isOpen,
  onClose,
  onViewAll,
  onNavigate,
}) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef(null);

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/notifications');
      if (res && res.notifications) {
        setNotifications(res.notifications);
      }
    } catch (e) {
      console.warn('[NotificationsPanel] Feed fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchFeed();
    }
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const markRead = async (id) => {
    try {
      await api.post('/api/notifications/read', { ids: [id] });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.warn('[NotificationsPanel] Mark read failed:', e);
    }
  };

  const handleItemClick = (item) => {
    markRead(item.id);
    if (item.link && onNavigate) {
      onNavigate(item.link);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Notifications"
      className="absolute top-full right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-surface-container-low/95 backdrop-blur-xl border border-outline-variant/30 shadow-2xl z-50 overflow-hidden text-on-surface"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20 bg-surface-container/50">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" />
          <span className="font-semibold text-xs tracking-tight uppercase font-mono">Notifications</span>
        </div>
        {notifications.some((n) => !n.read) && (
          <button
            type="button"
            onClick={() => {
              const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
              if (unreadIds.length > 0) {
                api.post('/api/notifications/read', { ids: unreadIds });
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
              }
            }}
            className="text-[11px] text-primary hover:underline cursor-pointer"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Feed Body */}
      <div className="max-h-80 overflow-y-auto os-scroll divide-y divide-outline-variant/15">
        {loading ? (
          <div className="p-8 text-center text-on-surface-variant font-mono text-xs animate-pulse">
            Loading notifications...
          </div>
        ) : notifications.length === 0 ? (
          /* Live Empty State per Spec 3.1.7 */
          <div className="p-8 text-center flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-surface-container-high/60 border border-outline-variant/20 flex items-center justify-center text-on-surface-variant mb-3">
              <BellOff className="w-5 h-5" />
            </div>
            <div className="font-medium text-xs text-on-surface mb-1">No notifications yet</div>
            <p className="font-mono text-[11px] text-on-surface-variant max-w-[200px] leading-relaxed mb-3">
              We'll ping you here when a draft is ready.
            </p>
            {onViewAll && (
              <button
                type="button"
                onClick={() => {
                  onViewAll();
                  onClose();
                }}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                Manage preferences <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              className={[
                'p-3.5 flex items-start gap-3 transition cursor-pointer hover:bg-surface-container/70',
                item.read ? 'opacity-75' : 'bg-surface-container/30',
              ].join(' ')}
            >
              <div className="mt-1 shrink-0">
                {item.read ? (
                  <span className="w-2 h-2 rounded-full border border-outline-variant/50 block" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-primary block shadow-[0_0_6px_rgba(120,245,229,0.6)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-on-surface truncate mb-0.5">{item.title}</div>
                <div className="text-[11px] text-on-surface-variant line-clamp-2 leading-relaxed">
                  {item.message}
                </div>
                {item.created_at && (
                  <div className="mt-1 text-[9px] font-mono text-outline">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {onViewAll && (
        <div className="p-2 border-t border-outline-variant/20 bg-surface-container/40 text-center">
          <button
            type="button"
            onClick={() => {
              onViewAll();
              onClose();
            }}
            className="w-full py-1.5 rounded-lg text-xs font-medium text-primary hover:bg-surface-container transition cursor-pointer"
          >
            View all notifications →
          </button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellOff,
  CheckCircle2,
  Filter,
  Settings,
  Shield,
  Bot,
  FileText,
  Mail,
  Send,
  Sparkles,
} from 'lucide-react';
import api from '../api.js';
import Button from './Button.jsx';
import SectionCard from './SectionCard.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { StatusDot } from './ui/StatusDot.jsx';

/**
 * NotificationsView — LUMINOUS GLASS Full-Screen Notification Center (Spec 3.1.8)
 * Tabs: All / Unread / Preferences
 * Filterable feed with source tags, mark-all-read action, and channel preferences.
 */
export default function NotificationsView({ onNavigate, user }) {
  const [tab, setTab] = useState('all'); // 'all' | 'unread' | 'preferences'
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({
    inApp: true,
    email: false,
    telegram: false,
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  const fetchFeed = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/notifications');
      if (res && res.notifications) {
        setNotifications(res.notifications);
      }
    } catch (e) {
      console.warn('[NotificationsView] Feed fetch failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  const markRead = async (id) => {
    try {
      await api.post('/api/notifications/read', { ids: [id] });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (e) {
      console.warn('[NotificationsView] Mark read failed:', e);
    }
  };

  const markAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    try {
      await api.post('/api/notifications/read', { ids: unreadIds });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (e) {
      console.warn('[NotificationsView] Mark all read failed:', e);
    }
  };

  const filteredItems = notifications.filter((n) => {
    if (tab === 'unread') return !n.read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] text-primary uppercase tracking-wider mb-1">
            <span>PLATFORM SYSTEM</span>
            <span>/</span>
            <span>TELEMETRY FEED</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold font-headline-lg text-on-surface tracking-tight">
            Notification Center
          </h1>
        </div>

        {unreadCount > 0 && tab !== 'preferences' && (
          <Button variant="secondary" size="sm" onClick={markAllRead}>
            <CheckCircle2 className="w-4 h-4 text-primary" /> Mark all as read
          </Button>
        )}
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
        <button
          type="button"
          onClick={() => setTab('all')}
          className={[
            'px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer min-h-[44px]',
            tab === 'all'
              ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
          ].join(' ')}
        >
          All Notifications ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('unread')}
          className={[
            'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer min-h-[44px]',
            tab === 'unread'
              ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
          ].join(' ')}
        >
          <span>Unread</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-primary text-on-primary font-bold">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('preferences')}
          className={[
            'flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition cursor-pointer min-h-[44px]',
            tab === 'preferences'
              ? 'bg-primary-container text-on-primary-container font-semibold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
          ].join(' ')}
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Delivery Preferences</span>
        </button>
      </div>

      {/* Content Area */}
      {tab === 'preferences' ? (
        <SectionCard id="notification-prefs" title="Delivery Channels" subtitle="Configure alert channels">
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-on-surface">In-App Notifications</div>
                  <div className="text-xs text-on-surface-variant">Real-time alerts inside the topbar and drawer</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.inApp}
                onChange={(e) => setPrefs({ ...prefs, inApp: e.target.checked })}
                className="w-5 h-5 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary/10 text-secondary">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-on-surface">Telegram Alerts</div>
                  <div className="text-xs text-on-surface-variant">Push notifications via your connected Telegram Agent</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.telegram}
                onChange={(e) => setPrefs({ ...prefs, telegram: e.target.checked })}
                className="w-5 h-5 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-container/50 border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-surface-container-high text-on-surface-variant">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-on-surface">Email Digest</div>
                  <div className="text-xs text-on-surface-variant">Periodic summary of completed assignments and updates</div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={prefs.email}
                onChange={(e) => setPrefs({ ...prefs, email: e.target.checked })}
                className="w-5 h-5 rounded text-primary focus:ring-primary cursor-pointer"
              />
            </div>
          </div>
        </SectionCard>
      ) : loading ? (
        <div className="p-12 text-center text-on-surface-variant font-mono text-sm animate-pulse">
          Loading notification stream...
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<BellOff className="w-8 h-8" />}
          title={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description="We will record and dispatch notifications here when drafts are generated, agents perform actions, or platform notices are published."
          action={
            <Button variant="secondary" onClick={() => setTab('all')}>
              Refresh feed
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => markRead(item.id)}
              className={[
                'p-4 rounded-2xl border transition cursor-pointer',
                'bg-surface-container-lowest/70 backdrop-blur-xl',
                item.read ? 'border-outline-variant/20 opacity-80' : 'border-primary/40 bg-surface-container-low/80 shadow-md',
                'hover:border-outline-variant/60',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0">
                    <StatusDot status={item.read ? 'slate' : 'primary'} pulse={!item.read} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-on-surface">{item.title}</span>
                      <span className="px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider bg-surface-container-high text-on-surface-variant">
                        {item.source || 'system'}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed mb-2">
                      {item.message}
                    </p>
                    {item.created_at && (
                      <span className="font-mono text-[10px] text-outline">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {item.link && onNavigate && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(item.link);
                    }}
                    className="shrink-0 text-xs text-primary"
                  >
                    Jump to {item.link} →
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

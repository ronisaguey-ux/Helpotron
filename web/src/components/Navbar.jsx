import React, { useState } from 'react';
import {
  Bell,
  SlidersHorizontal,
  LogOut,
  User,
  Settings,
  Shield,
  Clock,
  Sparkles,
  BookOpen,
  CheckCircle2,
  X,
} from 'lucide-react';

export default function Navbar({
  isLoggedIn = false,
  isGuest = false,
  user = null,
  isAdmin = false,
  onOpenSettings = () => {},
  onOpenAuth = () => {},
  onOpenPrivacy = () => {},
  onLogout = () => {},
  allTabs = [],
  visibleSections = {},
  onToggleSection = () => {},
  activeTabs = [],
}) {
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const notifications = [
    {
      id: 1,
      title: 'Lab Report Due Soon',
      desc: 'Cognitive Biases draft ready for review · PSYC 240',
      time: '2h ago',
      icon: Clock,
      unread: true,
    },
    {
      id: 2,
      title: 'Flashcards Generated',
      desc: '24 active recall cards ready for Cell Respiration',
      time: '4h ago',
      icon: Sparkles,
      unread: true,
    },
    {
      id: 3,
      title: 'Weekly Summary Ready',
      desc: '10.5 study hours tracked (+18% from last week)',
      time: '1d ago',
      icon: BookOpen,
      unread: false,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#090d16]/90 backdrop-blur-md border-b border-white/5 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
            H
          </div>
          <div>
            <span className="font-semibold text-sm text-slate-100 tracking-tight">Helpotron</span>
            <span className="text-[11px] text-slate-400 ml-2">Study Assistant</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          
          {/* Dedicated Privacy Policy Button */}
          <button
            type="button"
            onClick={onOpenPrivacy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-100 hover:bg-white/5 transition cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Privacy Policy</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowNotifMenu(!showNotifMenu);
                setShowVisibilityMenu(false);
              }}
              aria-label="View notifications"
              className="relative p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500" />
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-[#0f172a] border border-white/10 rounded-xl p-3 shadow-2xl z-50 animate-in fade-in">
                <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-2">
                  <span className="text-xs font-semibold text-slate-200">Notifications</span>
                  <span className="text-[10px] text-blue-400 font-medium">2 unread</span>
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {notifications.map((n) => {
                    const Icon = n.icon;
                    return (
                      <div
                        key={n.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg text-xs transition cursor-pointer ${
                          n.unread ? 'bg-blue-500/5 hover:bg-blue-500/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="p-1.5 rounded-md bg-white/5 text-blue-400 shrink-0 mt-0.5">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-200 truncate">{n.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{n.desc}</div>
                          <div className="text-[10px] text-slate-500 mt-1">{n.time}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section Visibility Manager */}
          {allTabs && allTabs.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setShowVisibilityMenu(!showVisibilityMenu);
                  setShowNotifMenu(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900 border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sections ({activeTabs?.length || allTabs.length})</span>
              </button>

              {showVisibilityMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-[#0f172a] border border-white/10 rounded-xl p-2 shadow-2xl z-50 text-xs">
                  <div className="text-[11px] font-semibold text-slate-400 px-2 py-1 border-b border-white/5 mb-1.5">
                    Toggle Workspace Modules
                  </div>
                  <div className="space-y-1">
                    {allTabs.map((t) => (
                      <label
                        key={t.key}
                        className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer text-slate-200 transition"
                      >
                        <span>{t.label}</span>
                        <input
                          type="checkbox"
                          checked={visibleSections[t.key] !== false}
                          onChange={() => onToggleSection(t.key)}
                          className="rounded accent-blue-500 cursor-pointer"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Credits Counter */}
          {user && (
            <div className="hidden sm:flex items-center px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-300 font-mono">
              <span className="text-slate-400 mr-1.5">Credits:</span>
              <span className="font-semibold text-slate-100">{Number(user.credits ?? 10029).toLocaleString()}</span>
            </div>
          )}

          {/* Auth Trigger */}
          {isLoggedIn ? (
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

        </div>
      </div>
    </header>
  );
}

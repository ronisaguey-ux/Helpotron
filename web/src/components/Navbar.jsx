// export target: web/src/components/Navbar.jsx
// @deprecated — Legacy standalone Navbar decommissioned in favor of canonical AppShell.jsx (SoT §9)
import React, { useState } from 'react';

import {
  User,
  Zap,
  Puzzle,
  Menu,
  X,
  ShieldCheck,
  FileText,
  Settings,
  LogOut,
  Sparkles,
} from 'lucide-react';

export function Navbar({
  isLoggedIn = false,
  isGuest = false,
  user = null,
  isAdmin = false,
  onOpenSettings = () => {},
  onOpenAuth = () => {},
  onOpenPrivacy = () => {},
  onOpenTerms = () => {},
  onOpenExtensionGuide = () => {},
  onLogout = () => {},
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header aria-label="Main Navigation" className="sticky top-0 z-40 bg-[#090d16]/90 backdrop-blur-md border-b border-white/5 px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-emerald-400 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-indigo-500/30">
            H
          </div>
          <div>
            <span className="font-semibold text-sm text-slate-100 tracking-tight">Helpotron</span>
            <span className="text-[11px] text-slate-400 ml-2">Study Assistant</span>
          </div>
        </div>

        {/* Desktop Navigation & Actions */}
        <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-1.5 backdrop-blur-xl shadow-lg shadow-black/20">
          <button
            type="button"
            onClick={onOpenExtensionGuide}
            title="Setup & Download Chrome Extension"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 hover:border-emerald-500/50 text-emerald-300 hover:text-white transition font-medium cursor-pointer"
          >
            <Puzzle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Extension Guide</span>
          </button>

          {user && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-300 font-mono">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">Credits:</span>
              <span className="font-semibold text-slate-100">{Number(user.credits ?? 0).toLocaleString()}</span>
            </div>
          )}

          {!isLoggedIn ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white transition cursor-pointer shadow-lg shadow-indigo-500/30"
            >
              <User className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="Open User Settings"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition cursor-pointer focus:ring-2 focus:ring-slate-400"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Mobile Hamburger Toggle Button (DES-MOB-001) */}
        <div className="flex sm:hidden items-center gap-2">
          {user && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5 text-[11px] text-slate-300 font-mono">
              <Zap className="w-3 h-3 text-blue-400" />
              <span>{Number(user.credits ?? 0).toLocaleString()}</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Mobile Navigation Drawer"
            className="p-2 rounded-xl text-slate-300 hover:text-white bg-slate-900 border border-white/10 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer Overlay (DES-MOB-001) */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation Menu"
          className="sm:hidden fixed inset-x-0 top-[53px] bottom-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 p-5 overflow-y-auto animate-fadeIn flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <Puzzle className="w-4 h-4 text-emerald-400" /> Chrome Extension
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenExtensionGuide();
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold cursor-pointer min-h-[44px] flex items-center"
              >
                Setup Guide →
              </button>
            </div>

            {user && (
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-white/10 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Available Credits:</span>
                <span className="text-blue-400 font-bold flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> {Number(user.credits ?? 0).toLocaleString()}
                </span>
              </div>
            )}

            <div className="space-y-1 pt-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenSettings();
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 hover:bg-white/5 border border-white/5 text-slate-200 text-xs font-medium min-h-[44px] cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-400" /> User Settings & Models
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenPrivacy();
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 hover:bg-white/5 border border-white/5 text-slate-200 text-xs font-medium min-h-[44px] cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Privacy Policy & FERPA
              </button>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenTerms();
                }}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-slate-900/60 hover:bg-white/5 border border-white/5 text-slate-200 text-xs font-medium min-h-[44px] cursor-pointer"
              >
                <FileText className="w-4 h-4 text-indigo-400" /> Terms of Service
              </button>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10">
            {!isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <User className="w-4 h-4" /> Sign In / Register
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full py-3 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/20 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar;

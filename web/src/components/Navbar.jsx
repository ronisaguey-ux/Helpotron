import React from 'react';
import { User, Zap, Puzzle } from 'lucide-react';

export default function Navbar({
  isLoggedIn = false,
  isGuest = false,
  user = null,
  onOpenAuth = () => {},
  onOpenExtensionGuide = () => {},
}) {
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

        {/* Minimalist Top Indicator */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenExtensionGuide}
            title="Setup & Download Chrome Extension"
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300 hover:text-white transition font-medium cursor-pointer"
          >
            <Puzzle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Extension Guide</span>
          </button>

          {user && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-300 font-mono">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-slate-400">Credits:</span>
              <span className="font-semibold text-slate-100">{Number(user.credits ?? 10029).toLocaleString()}</span>
            </div>
          )}

          {!isLoggedIn && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shadow-sm shadow-blue-500/20"
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

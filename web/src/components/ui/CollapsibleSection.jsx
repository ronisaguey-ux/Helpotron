import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function CollapsibleSection({ title, subtitle, icon: Icon, children, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-md overflow-hidden transition-all duration-300">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-6 py-4 cursor-pointer select-none bg-slate-950/20 hover:bg-slate-950/40 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-cyan-400 shrink-0" />}
          <div className="truncate">
            <h3 className="font-mono text-sm font-bold text-white tracking-wide">{title}</h3>
            {subtitle && <p className="text-[11px] font-mono text-slate-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        <button 
          type="button"
          aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
        >
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      <div className={`transition-all duration-300 ${isOpen ? 'max-h-[5000px] opacity-100 p-6 border-t border-white/5' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        {children}
      </div>
    </div>
  );
}

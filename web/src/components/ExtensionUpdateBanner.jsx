import React, { useState, useEffect } from 'react';
import { Download, Sparkles, X, Puzzle, ArrowRight, ExternalLink } from 'lucide-react';
import api from '../api';

export default function ExtensionUpdateBanner({ onOpenGuide }) {
  const [versionData, setVersionData] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    fetchVersion();
  }, []);

  const fetchVersion = async () => {
    try {
      const data = await api.getExtensionVersion();
      setVersionData(data);
      const dismissedVer = localStorage.getItem('helpotron_dismissed_ext_ver');
      if (dismissedVer === data.latest_version) {
        setIsDismissed(true);
      }
    } catch (e) {
      // Offline / silent
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (versionData?.latest_version) {
      localStorage.setItem('helpotron_dismissed_ext_ver', versionData.latest_version);
    }
  };

  const handleDownloadZip = () => {
    const link = document.createElement('a');
    link.href = '/api/extension/download';
    link.download = `helpotron-extension-v${versionData?.latest_version || '2.0.0'}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!versionData || isDismissed) return null;

  return (
    <aside
      aria-label="Extension Update Notification"
      className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border-b border-emerald-500/30 text-slate-100 py-2.5 px-4 sm:px-6 relative shadow-lg"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="w-6 h-6 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
            <Puzzle className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-white flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Helpotron Chrome Extension v{versionData.latest_version} Available!
          </span>
          <span className="text-slate-300 hidden md:inline">
            — Python math execution, Kimhons 38-pattern evasion, and chunked lecture streaming.
          </span>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={handleDownloadZip}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/50"
          >
            <Download className="w-3.5 h-3.5" /> Download (.zip)
          </button>
          <button
            type="button"
            onClick={onOpenGuide}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
          >
            Setup Guide <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss Update Notification"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition ml-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

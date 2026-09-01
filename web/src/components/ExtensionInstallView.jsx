import React, { useState, useEffect } from 'react';
import { 
  Download, Puzzle, Copy, CheckCircle2, Globe, Cpu, RefreshCw, 
  ExternalLink, Sparkles, ShieldCheck, Zap, BookOpen, Mic, 
  ChevronRight, ArrowRight, Layers, HelpCircle, Check
} from 'lucide-react';
import api, { getServer } from '../api';

export default function ExtensionInstallView() {
  const [versionData, setVersionData] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedChromeUrl, setCopiedChromeUrl] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeBrowser, setActiveBrowser] = useState('chromium');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const serverUrl = getServer() || window.location.origin;

  useEffect(() => {
    api.getExtensionVersion()
      .then(setVersionData)
      .catch(() => setVersionData({ latest_version: '2.0.1' }));
  }, []);

  const handleDownloadZip = () => {
    setIsDownloading(true);
    const link = document.createElement('a');
    link.href = `${serverUrl}/api/extension/download`;
    link.download = `helpotron-extension-v${versionData?.latest_version || '2.0.1'}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setIsDownloading(false);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 5000);
    }, 1200);
  };

  const copyToClipboard = async (text, setter) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      /* clipboard write rejected */
    }
  };

  const BROWSERS = [
    {
      id: 'chromium',
      name: 'Chrome / Brave / Edge',
      badge: 'Recommended (95% of students)',
      icon: Globe,
      color: 'text-indigo-400',
      description: 'Native Chromium Manifest V3 with full hardware-accelerated assistive typing.',
      steps: [
        {
          num: '1',
          title: 'Download & Unpack',
          desc: 'Download the extension zip file and extract it into a permanent folder on your computer (e.g., Documents/helpotron-extension).',
          hint: 'Chrome loads from an unzipped folder, not the raw .zip file.'
        },
        {
          num: '2',
          title: 'Open Extensions Manager',
          desc: 'In your browser address bar, navigate to the extensions page and toggle Developer Mode ON in the top-right corner.',
          action: {
            label: 'chrome://extensions',
            copyText: 'chrome://extensions',
            copiedState: copiedChromeUrl,
            setter: setCopiedChromeUrl
          }
        },
        {
          num: '3',
          title: 'Load Unpacked & Connect',
          desc: 'Click "Load unpacked", select your extracted folder, and pin Helpotron to your toolbar. Click the puzzle icon to begin scraping or assistive typing.',
          hint: 'The popup automatically connects to this workspace!'
        }
      ]
    },
    {
      id: 'firefox',
      name: 'Firefox',
      badge: 'Gecko Engine',
      icon: RefreshCw,
      color: 'text-orange-400',
      description: 'Works via Firefox developer runtime debugging with complete CORS isolation.',
      steps: [
        {
          num: '1',
          title: 'Download & Unzip',
          desc: 'Download the universal extension zip file and extract it to a permanent folder on your machine.'
        },
        {
          num: '2',
          title: 'Open Debugging Dashboard',
          desc: 'In Firefox, type about:debugging#/runtime/this-firefox into the URL bar and press Enter.'
        },
        {
          num: '3',
          title: 'Load Temporary Add-on',
          desc: 'Click "Load Temporary Add-on" and select the manifest.json file inside your unzipped folder.'
        }
      ]
    },
    {
      id: 'safari',
      name: 'Safari (macOS)',
      badge: 'Apple WebKit',
      icon: Cpu,
      color: 'text-purple-400',
      description: 'Native macOS companion converted via Xcode Web Extension tools.',
      steps: [
        {
          num: '1',
          title: 'Download Project Package',
          desc: 'Download the universal zip archive and unpack it to your local Projects directory.'
        },
        {
          num: '2',
          title: 'Import in Xcode',
          desc: 'Open Xcode → File → New → Project → Web Extension, and select the unzipped directory.'
        },
        {
          num: '3',
          title: 'Enable in Safari',
          desc: 'Run the project (⌘R) and check "Allow Unsigned Extensions" under Safari Settings → Advanced → Develop menu.'
        }
      ]
    }
  ];

  const currentBrowser = BROWSERS.find(b => b.id === activeBrowser) || BROWSERS[0];

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-10 font-sans animate-fadeIn">
      
      {/* ─── Hero Section ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl glass-panel p-6 sm:p-10 border border-white/10 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5" /> Helpotron Companion v{versionData?.latest_version || '2.0.1'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" /> Manifest V3 Ready
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              <Zap className="w-3.5 h-3.5" /> 100% Local &amp; Private
            </span>
          </div>

          <div className="space-y-2 max-w-3xl">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Supercharge your browser with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400">Helpotron OS</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Extract Canvas coursework, record lecture audio, and inject human-like assistive typing directly into Google Docs — without ever leaving your active course tabs.
            </p>
          </div>

          {/* Primary Action Row */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <button
              onClick={handleDownloadZip}
              disabled={isDownloading}
              className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 transition duration-200 cursor-pointer disabled:opacity-50"
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Packaging Extension…
                </>
              ) : downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-300" /> Download Started!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" /> Download Extension (.zip)
                </>
              )}
            </button>

            {/* Quick Connection Server Pill */}
            <div className="flex items-center justify-between sm:justify-start gap-2 px-4 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
              <span className="text-slate-400 shrink-0">Server Sync Origin:</span>
              <code className="font-mono text-indigo-300 font-semibold truncate max-w-[200px] sm:max-w-xs">{serverUrl}</code>
              <button
                onClick={() => copyToClipboard(serverUrl, setCopiedUrl)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition cursor-pointer shrink-0"
                title="Copy Server URL"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] font-semibold text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold">Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Interactive Installation Guide ────────────────────────────── */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Easy 3-Step Installation</h2>
            <p className="text-xs sm:text-sm text-slate-400">Select your browser to view tailored step-by-step setup instructions.</p>
          </div>
          
          {/* Browser Selection Tabs */}
          <div className="flex gap-2 p-1 rounded-xl bg-slate-950/60 border border-white/10 self-start sm:self-auto">
            {BROWSERS.map(b => {
              const Icon = b.icon;
              const isSelected = activeBrowser === b.id;
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveBrowser(b.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{b.name}</span>
                  <span className="sm:hidden">{b.id.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Browser Instructions Card */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-white/10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <currentBrowser.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">{currentBrowser.name} Setup</h3>
                <p className="text-xs text-slate-400">{currentBrowser.description}</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-white/5 text-slate-300 border border-white/10 hidden sm:inline-block">
              {currentBrowser.badge}
            </span>
          </div>

          {/* Steps Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
            {currentBrowser.steps.map((s, idx) => (
              <div key={idx} className="relative p-5 rounded-xl bg-slate-900/60 border border-white/10 flex flex-col justify-between space-y-3">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="w-7 h-7 rounded-lg bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 font-mono font-bold text-xs flex items-center justify-center">
                      {s.num}
                    </span>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-slate-500">Step {s.num} of 3</span>
                  </div>
                  <h4 className="text-sm font-bold text-white">{s.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
                </div>

                {s.action && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-white/15">
                      <code className="text-xs text-emerald-400 font-mono select-all truncate">{s.action.label}</code>
                      <button
                        onClick={() => copyToClipboard(s.action.copyText, s.action.setter)}
                        className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                        title="Copy to clipboard"
                      >
                        {s.action.copiedState ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {s.hint && (
                  <div className="pt-1">
                    <span className="text-[11px] text-indigo-300/90 italic flex items-center gap-1">
                      💡 {s.hint}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── What the Extension Unlocks (Feature Highlights) ─────────── */}
      <div className="space-y-6">
        <div className="border-b border-white/10 pb-4">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">Four Powerful In-Browser Capabilities</h2>
          <p className="text-xs sm:text-sm text-slate-400">Everything runs client-side inside your browser with maximum speed and zero friction.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Feature 1 */}
          <div className="glass-panel p-5 rounded-xl border border-white/10 hover:border-indigo-500/40 transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Universal LMS Auto-Scraper</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Extracts complete assignment rubrics, due dates, and prompt criteria from Canvas, Blackboard, Brightspace, and Google Classroom into structured workspace cards in 1 click.
              </p>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="glass-panel p-5 rounded-xl border border-white/10 hover:border-purple-500/40 transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Launch to Doc (Assistive Typing)</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Paces and types synthesized drafts directly into Google Docs or Word with 9 natural human-like cadence dimensions (typos, pauses, burst rhythm, and fatigue curve).
              </p>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="glass-panel p-5 rounded-xl border border-white/10 hover:border-cyan-500/40 transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Live Lecture Audio Recorder</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Record classroom lectures or video conferences directly from the tab, automatically generating timestamped transcripts, summaries, and flashcards in your Library.
              </p>
            </div>
          </div>

          {/* Feature 4 */}
          <div className="glass-panel p-5 rounded-xl border border-white/10 hover:border-emerald-500/40 transition space-y-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white">Autonomous In-Browser Subagent</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Give natural language directions directly to your scraper (e.g. <em>"Only scrape calculus problem sets"</em>) to selectively extract exactly what you need.
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ─── Frequently Asked Questions ────────────────────────────────── */}
      <div className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-400" /> Frequently Asked Questions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="space-y-1 bg-slate-900/50 p-3.5 rounded-xl border border-white/5">
            <div className="font-semibold text-white">Does the extension store my school login passwords?</div>
            <p className="text-slate-400">
              No. The extension operates completely locally in your browser. It never accesses, stores, or transmits your university credentials or administrative Canvas passwords.
            </p>
          </div>
          <div className="space-y-1 bg-slate-900/50 p-3.5 rounded-xl border border-white/5">
            <div className="font-semibold text-white">How do I update when a new version is released?</div>
            <p className="text-slate-400">
              Simply download the new zip file and extract it into your existing extension folder, replacing the files. Then click the reload button in <code className="text-indigo-300">chrome://extensions</code>.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}

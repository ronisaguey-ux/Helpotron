import React, { useState, useEffect } from 'react';
import {
  Puzzle, Copy, Globe, Cpu, RefreshCw,
  ExternalLink, Sparkles, ShieldCheck, Zap, BookOpen, Mic,
  ChevronRight, ArrowRight, ArrowLeft, Layers, HelpCircle, Check
} from 'lucide-react';
import api, { getServer } from '../api';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';

export default function ExtensionInstallView({ publicMode = false, onBack = null, onGoTo = null }) {
  const [versionData, setVersionData] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedChromeUrl, setCopiedChromeUrl] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [activeBrowser, setActiveBrowser] = useState('chromium');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const serverUrl = getServer() || window.location.origin;
  const STORE_URL = 'https://chromewebstore.google.com/detail/helpotron-academic-compan/nlbbjhgmdmjmlgojeiblkhfmmnlmfmjk';

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
    <div className="w-full min-h-screen bg-background text-on-surface font-sans">
      {publicMode && (
        <header className="sticky top-0 z-30 w-full border-b border-outline-variant/30 bg-surface/80 backdrop-blur-md mb-6">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-primary transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Helpotron
              </button>
            )}
            <div className="flex items-center gap-2">
              <AnimatedLogo size="sm" showWordmark={false} />
              <span className="font-bold text-sm text-primary tracking-tight">Extension Companion</span>
            </div>
            {onGoTo && (
              <button
                type="button"
                onClick={() => onGoTo('signup')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-semibold text-xs transition cursor-pointer active:scale-95 shadow-sm"
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>
      )}

      <div className="max-w-5xl mx-auto py-6 px-4 sm:px-6 space-y-10 animate-fadeIn">
        {/* ─── Hero Section ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-2xl bg-surface-container-low p-6 sm:p-10 border border-outline-variant/30 shadow-2xl">
          <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-64 h-64 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/15 text-primary border border-primary/20">
                <Sparkles className="w-3.5 h-3.5" /> Chrome Web Store v2.5.1
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-sem-green/15 text-sem-green border border-sem-green/20">
                <ShieldCheck className="w-3.5 h-3.5" /> Manifest V3 Ready
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-secondary/15 text-secondary border border-secondary/20">
                <Zap className="w-3.5 h-3.5" /> 100% Local &amp; Private
              </span>
            </div>

            <div className="space-y-2 max-w-3xl">
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
                Supercharge your browser with <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary via-secondary to-primary">Helpotron OS</span>
              </h1>
              <p className="text-sm sm:text-base text-on-surface-variant leading-relaxed">
                Extract Canvas coursework, record lecture audio, and inject human-like assistive typing directly into Google Docs — without ever leaving your active course tabs.
              </p>
            </div>

            {/* Primary Action Row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              {!publicMode && (
                <a
                  href={STORE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-bold text-sm shadow-md transition duration-200 cursor-pointer active:scale-95"
                >
                  <Puzzle className="w-4 h-4" /> Install from Chrome Web Store
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              )}

              {/* Quick Connection Server Pill */}
              <div className="flex items-center justify-between sm:justify-start gap-2 px-4 py-2.5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 text-xs">
                <span className="text-on-surface-variant shrink-0 font-medium">Server Sync Origin:</span>
                <code className="font-mono text-primary font-semibold truncate max-w-[200px] sm:max-w-xs">{serverUrl}</code>
                <button
                  onClick={() => copyToClipboard(serverUrl, setCopiedUrl)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant/30 transition cursor-pointer shrink-0"
                  title="Copy Server URL"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-sem-green" />
                      <span className="text-[11px] font-semibold text-sem-green">Copied</span>
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

            {/* Store version note + manual zip fallback */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 text-xs text-on-surface-variant">
              <span>
                The Chrome Web Store listing is <span className="text-on-surface font-semibold">v2.5.1</span> (approved &amp; live). Newer versions — including 2.6.0 — appear there automatically as soon as they pass review.
              </span>
              <span className="sm:ml-auto shrink-0">
                Manual install instead?{' '}
                <button
                  onClick={handleDownloadZip}
                  disabled={isDownloading}
                  className="underline decoration-primary/60 underline-offset-2 hover:text-primary transition cursor-pointer disabled:opacity-50 font-medium"
                >
                  {isDownloading ? 'Packaging…' : downloadSuccess ? 'Download started ✓' : `Download .zip (v${versionData?.latest_version || '2.0.1'})`}
                </button>
              </span>
            </div>
          </div>
        </div>

        {/* ─── Interactive Installation Guide ────────────────────────────── */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/30 pb-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight">Easy 3-Step Installation</h2>
              <p className="text-xs sm:text-sm text-on-surface-variant">Select your browser to view tailored step-by-step setup instructions.</p>
            </div>
            
            {/* Browser Selection Tabs */}
            <div className="flex gap-2 p-1 rounded-xl bg-surface-container-low border border-outline-variant/30 self-start sm:self-auto">
              {BROWSERS.map(b => {
                const Icon = b.icon;
                const isSelected = activeBrowser === b.id;
                return (
                  <button
                    key={b.id}
                    onClick={() => setActiveBrowser(b.id)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
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
          <div className="p-6 sm:p-8 rounded-2xl bg-surface-container-low border border-outline-variant/30 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <currentBrowser.icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-on-surface">{currentBrowser.name} Setup</h3>
                  <p className="text-xs text-on-surface-variant">{currentBrowser.description}</p>
                </div>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-surface-container text-on-surface-variant border border-outline-variant/30 hidden sm:inline-block">
                {currentBrowser.badge}
              </span>
            </div>

            {/* Steps Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
              {currentBrowser.steps.map((s, idx) => (
                <div key={idx} className="relative p-5 rounded-xl bg-surface-container-lowest border border-outline-variant/30 flex flex-col justify-between space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="w-7 h-7 rounded-lg bg-primary/15 text-primary border border-primary/25 font-mono font-bold text-xs flex items-center justify-center">
                        {s.num}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-on-surface-variant">Step {s.num} of 3</span>
                    </div>
                    <h4 className="text-sm font-bold text-on-surface">{s.title}</h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{s.desc}</p>
                  </div>

                  {s.action && (
                    <div className="pt-2">
                      <div className="flex items-center justify-between p-2 rounded-lg bg-surface-container border border-outline-variant/30">
                        <code className="text-xs text-primary font-mono select-all truncate">{s.action.label}</code>
                        <button
                          onClick={() => copyToClipboard(s.action.copyText, s.action.setter)}
                          className="p-1 rounded text-on-surface-variant hover:text-on-surface transition cursor-pointer"
                          title="Copy to clipboard"
                        >
                          {s.action.copiedState ? <Check className="w-3.5 h-3.5 text-sem-green" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {s.hint && (
                    <div className="pt-1">
                      <span className="text-[11px] text-primary/90 italic flex items-center gap-1">
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
          <div className="border-b border-outline-variant/30 pb-4">
            <h2 className="text-lg sm:text-xl font-bold text-on-surface tracking-tight">Four Powerful In-Browser Capabilities</h2>
            <p className="text-xs sm:text-sm text-on-surface-variant">Everything runs client-side inside your browser with maximum speed and zero friction.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Feature 1 */}
            <div className="p-5 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary/40 transition space-y-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface">Universal LMS Auto-Scraper</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Extracts complete assignment rubrics, due dates, and prompt criteria from Canvas, Blackboard, Brightspace, and Google Classroom into structured workspace cards in 1 click.
                </p>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="p-5 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary/40 transition space-y-3">
              <div className="w-9 h-9 rounded-lg bg-secondary/15 text-secondary flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface">Launch to Doc (Assistive Typing)</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Paces and types synthesized drafts directly into Google Docs or Word with 9 natural human-like cadence dimensions (typos, pauses, burst rhythm, and fatigue curve).
                </p>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="p-5 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary/40 transition space-y-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
                <Mic className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface">Live Lecture Audio Recorder</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Record classroom lectures or video conferences directly from the tab, automatically generating timestamped transcripts, summaries, and flashcards in your Library.
                </p>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="p-5 rounded-xl bg-surface-container-low border border-outline-variant/30 hover:border-primary/40 transition space-y-3">
              <div className="w-9 h-9 rounded-lg bg-sem-green/15 text-sem-green flex items-center justify-center">
                <Zap className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-on-surface">Autonomous In-Browser Subagent</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Give natural language directions directly to your scraper (e.g. <em>"Only scrape calculus problem sets"</em>) to selectively extract exactly what you need.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Frequently Asked Questions ────────────────────────────────── */}
        <div className="p-6 rounded-2xl bg-surface-container-low border border-outline-variant/30 space-y-4">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" /> Frequently Asked Questions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-on-surface-variant leading-relaxed">
            <div className="space-y-1 bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/20">
              <div className="font-semibold text-on-surface">Does the extension store my school login passwords?</div>
              <p>
                No. The extension operates completely locally in your browser. It never accesses, stores, or transmits your university credentials or administrative Canvas passwords.
              </p>
            </div>
            <div className="space-y-1 bg-surface-container-lowest p-3.5 rounded-xl border border-outline-variant/20">
              <div className="font-semibold text-on-surface">How do I update when a new version is released?</div>
              <p>
                Installed from the Chrome Web Store? It updates automatically once a new version is approved — no action needed. Installed the manual .zip? Download the new zip, replace the files in your extension folder, and hit reload in <code className="text-primary font-mono">chrome://extensions</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

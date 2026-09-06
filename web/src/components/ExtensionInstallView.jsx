import React, { useState, useEffect } from 'react';
import {
  Puzzle,
  Copy,
  Globe,
  Cpu,
  RefreshCw,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Zap,
  BookOpen,
  Mic,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Layers,
  HelpCircle,
  Check,
  Download,
  Terminal,
  Shield,
} from 'lucide-react';
import api, { getServer } from '../api.js';

export default function ExtensionInstallView({ publicMode = false, onBack = null, onGoTo = null }) {
  const [versionData, setVersionData] = useState(null);
  const [versionLoading, setVersionLoading] = useState(true);
  const [versionError, setVersionError] = useState(false);
  const [copiedOrigin, setCopiedOrigin] = useState(false);
  const [copiedChromeUrl, setCopiedChromeUrl] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const serverUrl = getServer() || window.location.origin;
  const STORE_URL = 'https://chromewebstore.google.com/detail/helpotron-academic-compan/nlbbjhgmdmjmlgojeiblkhfmmnlmfmjk';

  useEffect(() => {
    setVersionLoading(true);
    setVersionError(false);
    api.getExtensionVersion()
      .then((data) => {
        setVersionData(data);
      })
      .catch(() => {
        setVersionError(true);
      })
      .finally(() => {
        setVersionLoading(false);
      });
  }, []);

  const liveVersion = versionData?.latest_version || (versionLoading ? 'Loading...' : 'v4.2.0');

  const handleDownloadZip = () => {
    setIsDownloading(true);
    const link = document.createElement('a');
    link.href = `${serverUrl}/api/extension/download`;
    link.download = `helpotron-extension-${liveVersion}.zip`;
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

  const FAQ_ITEMS = [
    {
      q: 'Does the extension collect my browsing history or passwords?',
      a: 'Zero tracking or telemetry. The Helpotron companion operates entirely in 100% local context. It only reads the specific DOM nodes of assignments you explicitly click "Synthesize" or "Scrape" on.',
    },
    {
      q: 'Which learning management systems (LMS) are supported?',
      a: 'Canvas LMS, Blackboard Learn, Brightspace D2L, Google Classroom, Moodle, and standalone PDF syllabus pages.',
    },
    {
      q: 'How does the extension connect to my workspace?',
      a: 'The extension pairs directly via your Server Sync Origin URL. Once configured, assignments and captured rubrics sync straight into your Assignment Dump.',
    },
  ];

  return (
    <div className="space-y-8 max-w-5xl mx-auto p-2 sm:p-4 animate-fadeIn">
      {/* Header bar (with Back button if provided) */}
      {onBack && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
            Return to Workspace
          </span>
        </div>
      )}

      {/* SECTION 1: HERO GLASS BANNER (§3.14) */}
      <section className="relative rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 sm:p-10 md:p-12 shadow-2xl overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-10 right-10 w-[350px] h-[180px] bg-sem-cyan/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative flex flex-col items-start gap-6 max-w-3xl">
          {/* Badge Trio */}
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary/15 text-primary font-chip-status text-[10px] uppercase tracking-wider font-semibold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Chrome Web Store Verified
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sem-green/15 text-sem-green font-chip-status text-[10px] uppercase tracking-wider font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-sem-green"></span>
              Manifest V3 Compliant
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sem-cyan/15 text-sem-cyan font-chip-status text-[10px] uppercase tracking-wider font-semibold">
              <Shield className="w-3.5 h-3.5" />
              100% Local &amp; Zero PII
            </span>
          </div>

          {/* Heading with Teal Accent */}
          <div className="space-y-2">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-2xl sm:text-4xl md:text-5xl text-on-surface font-bold tracking-tight leading-tight">
              Helpotron Companion <span className="text-primary">Extension</span>
            </h1>
            <p className="font-body-md text-sm sm:text-base text-on-surface-variant max-w-xl leading-relaxed">
              Seamlessly capture syllabi, Canvas / Blackboard assignments, and research papers straight from your browser into Helpotron OS.
            </p>
          </div>

          {/* Live Version Indicator (§3.14 Honesty Rule: ONE live value) */}
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-surface-container-high/60 border border-outline-variant/15 text-xs">
            <span className={`w-2 h-2 rounded-full ${versionError ? 'bg-sem-amber' : 'bg-primary animate-pulse'}`} />
            <span className="font-code-sm text-on-surface">
              {versionLoading ? (
                'Fetching live release...'
              ) : versionError ? (
                'Live release server unreachable · Local fallback'
              ) : (
                `Live Release ${liveVersion} · Manifest V3`
              )}
            </span>
          </div>

          {/* Primary Action Row (Hidden or simplified in publicMode if requested) */}
          {!publicMode && (
            <div className="flex flex-wrap items-center gap-3 pt-2 w-full sm:w-auto">
              <a
                href={STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto min-h-[44px] px-6 py-3 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold shadow-[0_0_24px_rgba(120,245,229,0.25)] hover:brightness-105 active:scale-[0.98] transition flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4 text-on-primary" />
                <span>Add to Chrome (Free)</span>
              </a>

              <button
                type="button"
                disabled={isDownloading}
                onClick={handleDownloadZip}
                className="w-full sm:w-auto min-h-[44px] px-5 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider font-semibold transition active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4 text-on-surface-variant" />
                <span>{isDownloading ? 'Downloading Zip...' : downloadSuccess ? 'Downloaded!' : 'Download Zip Build'}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 2: BROWSER ENCLAVE LANES (§3.14) */}
      <section className="space-y-4">
        <div className="space-y-0.5">
          <span className="font-label-caps text-xs text-primary uppercase tracking-widest">Platform Channels</span>
          <h2 className="font-title-md text-lg text-on-surface font-semibold">Supported Runtime Enclaves</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Google Chrome (Official Primary) */}
          <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border-2 border-primary/40 shadow-[0_0_20px_rgba(120,245,229,0.12)] flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                  <Globe className="w-5 h-5" />
                </div>
                <span className="font-chip-status text-[10px] text-sem-green bg-sem-green/15 px-2 py-0.5 rounded-full uppercase flex items-center gap-1 font-semibold">
                  <span className="w-1 h-1 rounded-full bg-sem-green"></span>
                  Official Store Release
                </span>
              </div>
              <div>
                <h3 className="font-title-md text-base text-on-surface font-semibold">Google Chrome &amp; Chromium</h3>
                <p className="font-body-sm text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Native runtime for Chrome, Brave, Arc, Microsoft Edge, and Opera GX with hardware-accelerated text capture.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <a
                href={STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-primary text-on-primary font-label-caps text-xs uppercase tracking-wider font-semibold flex items-center justify-center gap-2 hover:brightness-105 active:scale-[0.98] transition shadow-sm"
              >
                <Download className="w-4 h-4" />
                <span>Install from Store</span>
              </a>
            </div>
          </div>

          {/* Card 2: Mozilla Firefox (Experimental) */}
          <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-sem-amber/10 border border-sem-amber/20 flex items-center justify-center text-sem-amber">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <span className="font-chip-status text-[10px] text-sem-amber bg-sem-amber/15 px-2 py-0.5 rounded-full uppercase flex items-center gap-1 font-semibold">
                  <span className="w-1 h-1 rounded-full bg-sem-amber"></span>
                  Experimental Dev Build
                </span>
              </div>
              <div>
                <h3 className="font-title-md text-base text-on-surface font-semibold">Mozilla Firefox</h3>
                <p className="font-body-sm text-xs text-on-surface-variant mt-1 leading-relaxed">
                  Gecko runtime loader truth. Requires loading unpacked add-on or direct developer debugging runner.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleDownloadZip}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-caps text-xs uppercase tracking-wider transition"
              >
                Download Gecko Zip
              </button>
            </div>
          </div>

          {/* Card 3: Apple Safari (Developer Preview) */}
          <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-2xl bg-surface-container-high flex items-center justify-center text-on-surface-variant">
                  <Cpu className="w-5 h-5" />
                </div>
                <span className="font-chip-status text-[10px] text-on-surface-variant bg-surface-container-high px-2 py-0.5 rounded-full uppercase font-semibold">
                  Developer Preview
                </span>
              </div>
              <div>
                <h3 className="font-title-md text-base text-on-surface font-semibold">Apple Safari</h3>
                <p className="font-body-sm text-xs text-on-surface-variant mt-1 leading-relaxed">
                  WebExtension converter format. Requires Xcode signing and macOS developer certificate to deploy locally.
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-surface-container-high/50 text-on-surface-variant font-label-caps text-xs uppercase tracking-wider cursor-not-allowed"
              >
                Xcode Build Only
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: 3 STEP INSTALL CARDS */}
      <section className="space-y-4">
        <div className="space-y-0.5">
          <span className="font-label-caps text-xs text-primary uppercase tracking-widest">Manual Setup Guide</span>
          <h2 className="font-title-md text-lg text-on-surface font-semibold">3-Step Developer Mode Deployment</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 space-y-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-tabular-stat text-sm font-bold flex items-center justify-center">
              1
            </div>
            <h3 className="font-title-md text-sm text-on-surface font-semibold">Download &amp; Unzip</h3>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              Download the extension zip file and extract it into a permanent folder on your machine (e.g. Documents/helpotron-extension).
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 space-y-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-tabular-stat text-sm font-bold flex items-center justify-center">
              2
            </div>
            <h3 className="font-title-md text-sm text-on-surface font-semibold">Open Extensions Manager</h3>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              Navigate to the extension manager in your browser and toggle Developer Mode ON in the top-right corner.
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard('chrome://extensions', setCopiedChromeUrl)}
              className="w-full min-h-[38px] px-3 rounded-xl bg-surface-container hover:bg-surface-container-high text-xs font-code-sm text-primary flex items-center justify-between transition"
            >
              <span>chrome://extensions</span>
              {copiedChromeUrl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 space-y-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary font-tabular-stat text-sm font-bold flex items-center justify-center">
              3
            </div>
            <h3 className="font-title-md text-sm text-on-surface font-semibold">Load Unpacked &amp; Sync</h3>
            <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
              Click "Load unpacked", select your extracted folder, and pin Helpotron to your browser toolbar.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 4: SERVER SYNC ORIGIN PILL */}
      <section className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider">
            Companion Pairing Origin
          </span>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Paste this URL into the extension settings popup if prompted to synchronize with this workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={() => copyToClipboard(serverUrl, setCopiedOrigin)}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-xs font-code-sm text-on-surface flex items-center gap-2 border border-outline-variant/20 transition self-start sm:self-center"
        >
          <span className="select-all">{serverUrl}</span>
          {copiedOrigin ? <Check className="w-4 h-4 text-sem-green" /> : <Copy className="w-4 h-4 text-on-surface-variant" />}
        </button>
      </section>

      {/* SECTION 5: FAQ ACCORDIONS */}
      <section className="rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/20 p-6 sm:p-8 space-y-4">
        <div className="space-y-1">
          <h2 className="font-title-md text-lg text-on-surface font-semibold">Frequently Asked Questions</h2>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Everything you need to know about browser companion security and privacy.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          {FAQ_ITEMS.map((item, idx) => (
            <details
              key={idx}
              className="group p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/15 transition cursor-pointer"
            >
              <summary className="font-title-md text-xs sm:text-sm font-semibold text-on-surface list-none flex items-center justify-between">
                <span>{item.q}</span>
                <ChevronRight className="w-4 h-4 text-on-surface-variant group-open:rotate-90 transition-transform" />
              </summary>
              <p className="font-body-sm text-xs text-on-surface-variant mt-2 leading-relaxed">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

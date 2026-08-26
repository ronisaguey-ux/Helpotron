import React, { useState, useEffect } from 'react';
import { Download, Puzzle, ExternalLink, HelpCircle, CheckCircle, AlertTriangle, Copy, Cpu, Globe, RefreshCw } from 'lucide-react';
import api, { getUserId, getServer } from '../api';

/* ExtensionInstallView — replaces the old extension popup. Sidebar section with the
 * download button + full cross-platform install guide (Win/macOS/Linux × Chrome/Edge/
 * Brave · Firefox · Safari). */
export default function ExtensionInstallView() {
  const [versionData, setVersionData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const publicId = getUserId() || 'RoniDev';
  const serverUrl = getServer() || window.location.origin;

  useEffect(() => {
    api.getExtensionVersion().then(setVersionData).catch(() => setVersionData({ latest_version: '2.0.0' }));
  }, []);

  const handleDownloadZip = () => {
    setIsDownloading(true);
    const link = document.createElement('a');
    link.href = '/api/extension/download';
    link.download = `helpotron-extension-v${versionData?.latest_version || '2.0.0'}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setIsDownloading(false), 2000);
  };

  const copy = (t) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const Step = ({ n, children }) => (
    <li className="flex gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold flex items-center justify-center mt-0.5">{n}</span>
      <span className="text-sm leading-relaxed text-slate-300">{children}</span>
    </li>
  );
  const Btn = ({ children, ...p }) => <button {...p} className="ml-1 px-2 py-0.5 rounded bg-slate-700/70 hover:bg-slate-600 text-slate-200 text-xs border border-slate-600">{children}</button>;
  const K = ({ children }) => <code className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-emerald-300 text-xs">{children}</code>;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
        <Puzzle className="text-cyan-400" size={26} /> Helpotron Extension
      </h1>
      <p className="text-slate-400 text-sm mt-1">
        Scrapes Canvas, Google Classroom, Blackboard, Brightspace, Moodle, Schoology, Notion &amp; any website into assignments.
        Works on <b className="text-slate-200">Windows · macOS · Linux</b> in <b className="text-slate-200">Chrome · Edge · Brave · Firefox · Safari</b>.
      </p>

      <div className="mt-4 p-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 flex flex-wrap items-center gap-4">
        <button
          onClick={handleDownloadZip}
          disabled={isDownloading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-sm disabled:opacity-60"
        >
          <Download size={17} /> {isDownloading ? 'Downloading…' : `Download Extension v${versionData?.latest_version || '2.0.0'}`}
        </button>
        <span className="text-xs text-slate-400">
          Same zip works for Chrome/Edge/Brave (Chromium) and Firefox. Connecting to: <b className="text-slate-200">{serverUrl}</b>
          <Btn onClick={() => copy(serverUrl)}>{copied ? 'Copied ✓' : <><Copy size={12} className="inline mr-1" />Copy URL</>}</Btn>
        </span>
      </div>

      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-100 flex items-center gap-2"><Globe size={16} className="text-blue-400" /> Chrome / Edge / Brave</h2>
          <p className="text-xs text-slate-500 mb-2">Windows · macOS · Linux</p>
          <ol className="space-y-2">
            <Step n={1}><b>Download</b> the zip above and <b>extract it</b> to a permanent folder (e.g. <K>~/helpotron-extension</K>). Chrome loads a folder, not the zip.</Step>
            <Step n={2}>Open <K>chrome://extensions</K> (Edge: <K>edge://extensions</K>, Brave: <K>brave://extensions</K>).</Step>
            <Step n={3}>Turn <b>Developer mode</b> ON (top-right toggle).</Step>
            <Step n={4}>Click <b>Load unpacked</b> → select the extracted folder → it appears in the list.</Step>
            <Step n={5}>Pin it from the <b>Puzzle icon</b> in the toolbar → open popup → paste your server URL if different from auto-detected.</Step>
          </ol>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-100 flex items-center gap-2"><RefreshCw size={16} className="text-orange-400" /> Firefox</h2>
          <p className="text-xs text-slate-500 mb-2">Windows · macOS · Linux</p>
          <ol className="space-y-2">
            <Step n={1}><b>Download</b> + <b>extract</b> the same zip to a folder.</Step>
            <Step n={2}>Open <K>about:debugging#/runtime/this-firefox</K>.</Step>
            <Step n={3}>Click <b>Load Temporary Add-on</b> → pick <K>manifest.json</K> inside the folder.</Step>
            <Step n={4}><AlertTriangle size={12} className="inline text-amber-400" /> Temporary add-ons disappear when Firefox closes. For a permanent install, package the zip as an <b>XPI</b> and submit it free at <K>addons.mozilla.org</K> (5-min signing; self-host the signed file). Dev-demo shortcut: <K>about:config</K> → set <K>xpinstall.signatures.required</K> → false.</Step>
            <Step n={5}>Pin from the <b>Puzzle icon</b>, configure the server URL in the popup settings.</Step>
          </ol>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <h2 className="font-semibold text-slate-100 flex items-center gap-2"><Cpu size={16} className="text-purple-400" /> Safari</h2>
          <p className="text-xs text-slate-500 mb-2">macOS only</p>
          <ol className="space-y-2">
            <Step n={1}>You need a Mac with Xcode. Download + unzip the same file into your Projects folder.</Step>
            <Step n={2}>On your Mac: open Xcode → <b>File → New → Project</b> → <b>Web Extension</b> → point it at the unzipped folder (the built-in converter imports the unpacked extension automatically).</Step>
            <Step n={3}>Run (⌘R) → Safari opens with a prompt → <b>Develop → Allow Unsigned Extensions</b> (Safari → Settings → Advanced → <b>Show features for web developers</b> first).</Step>
            <Step n={4}>Keep Xcode running during the demo — development builds only load while debugged. For friends: export the app build and test the <b>temporary</b> install; full distribution needs your Apple Developer account.</Step>
            <Step n={5}>No Mac? Use Chrome/Edge/Brave on Windows/Linux — the extension is identical.</Step>
          </ol>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl border border-slate-700 bg-slate-900/60">
        <h2 className="font-semibold text-slate-100 flex items-center gap-2"><HelpCircle size={16} className="text-green-400" /> First-time setup</h2>
        <ol className="space-y-2 mt-2">
          <Step n={1}>Open the popup on your course page → <b>Quick Scrape</b> pulls the assignment list (detects Canvas/CB/BB/Brightspace/Moodle/GC/Notion automatically).</Step>
          <Step n={2}>Set the <b>server URL</b> to this origin ({serverUrl}) via the popup's connection field — it saves in chrome.storage in one click.</Step>
          <Step n={3}><CheckCircle size={12} className="inline text-emerald-400" /> Scraped items land in <b>Dashboard → Assignments</b>; run <b>My Agent</b> on one to dispatch the AI team (thesis, outline, rubric, feedback).</Step>
          <Step n={4}>Click <b>Record Lecture Audio</b> to capture class audio (needs microphone permission).</Step>
        </ol>
        <p className="text-xs text-slate-500 mt-3">
          Having trouble? Tell us via <ExternalLink size={11} className="inline" /> the popup's <b>Data Lake</b> feedback box, or check <K>{serverUrl} (Settings → Privacy &amp; Security)</K>.
        </p>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Compatibility note: this release ships the Chromium+Firefox MV3 build (same zip). Safari runs the same code via Xcode's Web-Extension converter on macOS. Extension needs Chrome 88+/Firefox 121+.
      </div>
    </div>
  );
}

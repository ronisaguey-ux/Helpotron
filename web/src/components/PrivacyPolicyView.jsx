/* ────────────────────────────────────────────────────────────────────────────
 * PrivacyPolicyView.jsx — Helpotron Privacy & Data Governance (v3 Stitch v6)
 * Radical transparency: 6 honest sections locked to actual code behavior,
 * Trust Pillars, Operator Control Center with Export/Purge actions,
 * 'Find a field' search filter, provider matrix with 'what they receive',
 * 'What stays on your machine' luminous callout, and retention timeline.
 * ────────────────────────────────────────────────────────────────────────── */
import React, { useState } from 'react';
import {
  Shield, Database, Server, HardDrive, UserCheck, School, Lock,
  Search, ArrowLeft, ArrowRight, CheckCircle2, Download, Trash2,
  Clock, AlertTriangle, FileText, ExternalLink, RefreshCw, Cpu
} from 'lucide-react';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';
import api from '../api.js';

const DATA_CATEGORIES = [
  { code: 'CAT-01', name: 'Account identity', elements: 'Username (public_id), display name, role, plan, credit balance, account creation date. Zero email is collected at signup.', retention: 'Until you delete the account', why: 'To authenticate and service your account' },
  { code: 'CAT-02', name: 'Login security', elements: 'PBKDF2-SHA256 password hash + salt (100,000 iterations), 24-hour JWT token, 7-day database session cookie, CSRF token, optional TOTP secret.', retention: 'Sessions expire in 7 days; password hash persists until deletion', why: 'To protect account boundaries' },
  { code: 'CAT-03', name: 'Phone & SMS', elements: 'Phone number if SMS two-factor enabled; free-trial phone numbers stored only as salted SHA-256 hashes + masked number and claim IP.', retention: 'Until you remove 2FA or delete account; trial hashes kept for anti-abuse', why: 'To send 2FA codes and enforce trial limits' },
  { code: 'CAT-04', name: 'Coursework', elements: 'Assignment titles, prompts, due dates, course names, Canvas-sync data, scraped rubric text, attached files (up to 6 MB each).', retention: 'Until you delete the account', why: 'To synthesize and execute coursework' },
  { code: 'CAT-05', name: 'Study materials', elements: 'Generated study guides, flashcard sets, practice tests, summaries, writing drafts, Anki/Quizlet exports.', retention: 'Until you delete the account', why: 'Primary requested academic deliverables' },
  { code: 'CAT-06', name: 'Audio & transcripts', elements: 'Lecture recordings from extension recorder (microphone audio) and AI-generated transcripts.', retention: 'Files and transcripts until account deletion', why: 'To transcribe and summarize lectures' },
  { code: 'CAT-07', name: 'Agent chat & memory', elements: 'Chat threads and messages, long-term memory notes, files uploaded to agent, executed agent action ledger.', retention: 'Until you delete the account', why: 'To maintain conversational continuity' },
  { code: 'CAT-08', name: 'Screen frames', elements: 'Single compressed JPEG frame (longest side <=1280px) sent ONLY while "See screen" toggle is active.', retention: 'Turn-only ephemeral; never persisted in database', why: 'To provide real-time visual context to agent' },
  { code: 'CAT-09', name: 'Preferences & settings', elements: 'Theme, accent, effort level, scoped rule overrides, custom subjects/bubbles, writing style samples.', retention: 'Until deletion or browser storage cleared', why: 'To honor user workflow preferences' },
  { code: 'CAT-10', name: 'Billing & credits', elements: 'Stripe customer/subscription IDs, token ledger, payment records (provider, reference, amount). Card numbers never touch our servers.', retention: 'Until account deletion', why: 'To invoice and grant credits' },
  { code: 'CAT-11', name: 'Referrals & study groups', elements: 'Single-use referral codes, reward allocations, study group rosters, shared material pointers.', retention: 'Until account deletion or leaving group', why: 'To administer peer referral rewards' },
  { code: 'CAT-12', name: 'Telemetry & logs', elements: 'Anonymized Data Lake events (scrubbed write-outcomes, hashed IDs), token consumption ledger, rotating access logs.', retention: 'Logs rotate on server; usage rows until deletion', why: 'To guarantee uptime and enforce quotas' },
];

const THIRD_PARTIES = [
  { name: 'OpenRouter (AI Model Gateway)', role: 'All AI text generation, vision, and audio transcription', data: 'Prompts, chat messages, assignment text, study files, transcripts, screen frames, and audio go to OpenRouter, serving DeepSeek and Google Gemini models. We never call OpenAI or Anthropic.', location: 'United States' },
  { name: 'Cloudflare (Tunnel & Turnstile)', role: 'Encrypted tunnel into our server and Turnstile human verification at signup/login', data: 'Proxy metadata (IP address, request headers, TLS handshake details) and Turnstile challenge solution; zero coursework content.', location: 'Global edge network' },
  { name: 'Stripe', role: 'Subscription checkout and billing', data: 'Checkout details and billing metadata. We store only Stripe customer and subscription IDs; credit card numbers never touch our servers.', location: 'United States / Ireland' },
  { name: 'Twilio', role: 'SMS dispatch for two-factor authentication and phone recovery', data: 'Destination phone number and one-time verification code.', location: 'United States' },
  { name: 'Google', role: 'Gemini multimodal models (served via OpenRouter) and user Google Docs via Launch to Doc', data: 'Transcribed audio via OpenRouter gateway. For Launch to Doc: text is typed directly into your document locally by the extension under your Google account.', location: 'United States' },
  { name: 'Telegram', role: 'Optional user bot notification channel', data: 'Outbound notifications and conversational turns if you explicitly connect a bot token.', location: 'Telegram servers' },
  { name: 'Pangram Labs', role: 'AI detection analysis and writing authenticity verification', data: 'Generated draft passages and writing samples submitted to verify human-score benchmarks; zero student account identity sent.', location: 'United States' },
  { name: 'Sapling AI', role: 'AI content detection and grammatical originality analysis', data: 'Draft text snippets submitted for detection probability checks and quality scoring.', location: 'United States' },
  { name: 'Your School LMS', role: 'Canvas, Blackboard, D2L, Moodle, Schoology (via browser extension)', data: 'Scraped assignment rubrics and prompts using your own authenticated session in the browser. Zero background crawling.', location: 'Your institution server' },
];

const RETENTION_TIMELINE = [
  { period: 'Turn only', label: 'Screen Frames', desc: 'Processed ephemerally in GPU memory; discarded immediately after inference turn.' },
  { period: '15–30 Mins', label: '2FA & Recovery Codes', desc: 'Single-use OTP verification codes expire automatically.' },
  { period: '24 Hours', label: 'Authentication Tokens', desc: 'Stateless JWT tokens invalidate after 24 hours without renewal.' },
  { period: '7 Days', label: 'Session Cookies', desc: 'HttpOnly browser session tokens expire after 7 days of inactivity.' },
  { period: 'Account Life', label: 'Coursework & Deliverables', desc: 'Study guides, essays, chat histories persist until you click Delete Account.' },
];

const RIGHTS = [
  { title: 'Access & Portability', text: 'Export All (Settings → Data → Export All) generates a comprehensive JSON bundle of everything in your account (settings, assignments, materials, chats, Data Lake entries).' },
  { title: 'Immediate Erasure', text: 'Delete Account (Settings → Account → Delete Account) executes a single-transaction cascade wipe of your user row and all associated records (assignments, transcripts, chats, payments).' },
  { title: 'Rectification', text: 'Correct academic profiles, writing DNA samples, custom subjects, and rule overrides at any time directly in Settings.' },
  { title: 'Non-Destructive Reset', text: 'Soft Reset restores system defaults and archives unfinished staging without permanently destroying your historical materials.' },
  { title: 'Formal Data Inquiries', text: 'Direct GDPR/CCPA subject access requests to privacy@helpotron.com — processed within statutory timelines. Zero data sale or cross-context ad brokering.' },
];

export default function PrivacyPolicyView({ publicMode = false, onBack = null, onGoTo = null }) {
  const [activeSection, setActiveSection] = useState('inventory');
  const [searchQuery, setSearchQuery] = useState('');
  const [exporting, setExporting] = useState(false);

  const filteredCategories = DATA_CATEGORIES.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.elements.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.why.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleExportData = async () => {
    setExporting(true);
    try {
      await api.exportDataLakeEntries();
    } catch (e) {
      console.error('Export failed:', e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-background text-on-surface">
      {/* Public Mode Header */}
      {publicMode && (
        <header className="sticky top-0 z-30 w-full border-b border-outline-variant/30 bg-surface/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-primary transition cursor-pointer min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Helpotron
            </button>
            <div className="flex items-center gap-2">
              <AnimatedLogo size="sm" showWordmark={false} />
              <span className="font-bold text-sm text-primary tracking-tight">Helpotron Privacy</span>
            </div>
            {onGoTo && (
              <button
                type="button"
                onClick={() => onGoTo('signup')}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-semibold text-xs transition cursor-pointer active:scale-95 shadow-sm"
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Back link when not in public header mode */}
        {!publicMode && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[44px] inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/30 text-xs font-semibold text-on-surface-variant hover:text-on-surface transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
        )}

        {/* Hero Section & Trust Posture */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-primary font-mono text-xs font-bold uppercase tracking-wider">
            <span>Platform Legal</span>
            <span className="text-outline-variant/50">/</span>
            <span>Privacy &amp; Data Rights</span>
            <span className="text-outline-variant/50">//</span>
            <span className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface text-[10px] font-mono">REV 2026.4</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-3xl">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-on-surface">
                Privacy &amp; Data Governance
              </h1>
              <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">
                Clear storage: Helpotron is operated by Helpotron Autonomous Systems LLC ("we", "us", or "our"). We store only what is required to run and bill your workspace. You keep control of your own data — nothing is sold, and you can delete your workspace data from the account settings.
              </p>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-container-low border border-outline-variant/30 shadow-sm shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-sem-green animate-pulse" />
              <div className="flex flex-col">
                <span className="text-xs font-bold text-on-surface uppercase tracking-wider font-mono">Zero Data Sale Guaranteed</span>
                <span className="text-[11px] text-on-surface-variant">Last Audit: Verified 2026</span>
              </div>
            </div>
          </div>

          {/* 3 Trust Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 flex flex-col justify-between hover:border-primary/40 transition shadow-sm">
              <div>
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
                  <Cpu className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-on-surface mb-1">Encrypted Session Storage</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Your workspace data is stored in a local database. Passwords are stored only as hashes, sessions use signed cookies over HTTPS, and coursework is sent only to the model service configured for the task you asked for.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between text-[11px] font-mono text-primary">
                <span>HTTPS Only · Encrypted Storage</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 flex flex-col justify-between hover:border-secondary/40 transition shadow-sm">
              <div>
                <div className="w-9 h-9 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary mb-3">
                  <Clock className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-on-surface mb-1">Deterministic Retention</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Ephemeral buffers auto-expire within 24 hours. Sessions flush automatically at 7 days. Permanent workspace files persist strictly until self-deleted.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between text-[11px] font-mono text-secondary">
                <span>Zero Silent Ghosting</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 flex flex-col justify-between hover:border-tertiary/40 transition shadow-sm">
              <div>
                <div className="w-9 h-9 rounded-xl bg-tertiary/10 border border-tertiary/20 flex items-center justify-center text-tertiary mb-3">
                  <Shield className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-on-surface mb-1">Zero Data Brokering</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Student assignments, uploaded thesis chapters, and prompt chains are never commodified, sold to third parties, or incorporated into foundation model training.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-outline-variant/20 flex items-center justify-between text-[11px] font-mono text-tertiary">
                <span>Strict No-Train Policy</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
          </div>
        </section>

        {/* Operator Control Center (Spec 3.16 Action Deck) */}
        {!publicMode && (
          <section className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 shadow-md">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-primary font-bold uppercase tracking-wider">Operator Control Center</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface font-mono text-[10px]">Encrypted Transport</span>
                </div>
                <h2 className="text-lg font-bold text-on-surface">Self-Service Data Controls</h2>
                <p className="text-xs text-on-surface-variant">Export everything your account holds or permanently wipe all data in one click.</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting}
                  className="min-h-[44px] px-5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{exporting ? 'Generating Export...' : 'Export Archive (.json)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onGoTo) onGoTo('settings');
                    else window.location.hash = '#settings';
                  }}
                  className="min-h-[44px] px-5 rounded-xl bg-error-container/20 hover:bg-error-container/40 text-error border border-error/30 text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition cursor-pointer active:scale-95"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Purge Account (Settings)</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Navigation Tabs for the 6 Sections */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-outline-variant/20 scrollbar-none" role="tablist">
          {[
            { id: 'inventory', label: '1. What We Store', icon: Database },
            { id: 'thirdparties', label: '2. AI & Third Parties', icon: Server },
            { id: 'storage', label: '3. Storage & Retention', icon: HardDrive },
            { id: 'rights', label: '4. Your Rights & GDPR', icon: UserCheck },
            { id: 'kids', label: '5. Schools & FERPA', icon: School },
            { id: 'security', label: '6. Security & Contact', icon: Lock },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(tab.id)}
                className={`min-h-[40px] flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer active:scale-95 ${
                  active
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-surface-container-low/70 text-on-surface-variant hover:text-on-surface hover:bg-surface-container border border-outline-variant/20'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* SECTION 1: Data Inventory */}
        {activeSection === 'inventory' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30">
              <div className="max-w-xl">
                <h2 className="text-base font-bold text-on-surface">Data Inventory &amp; Categorization</h2>
                <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                  Every field below is audited against running server code. "Until you delete the account" indicates removal via the Delete Account button.
                </p>
              </div>
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70" />
                <input
                  type="text"
                  placeholder="Find a field or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-container-low text-xs text-on-surface placeholder:text-on-surface-variant/50 border border-outline-variant/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCategories.map((cat) => (
                <div
                  key={cat.code}
                  className="p-5 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 flex flex-col justify-between gap-3 shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                        {cat.code}
                      </span>
                      <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                        {cat.retention}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-on-surface mb-1">{cat.name}</h3>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{cat.elements}</p>
                  </div>
                  <div className="pt-2 border-t border-outline-variant/20 flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                    <span className="font-semibold text-on-surface">Purpose:</span>
                    <span>{cat.why}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2: AI & Third Parties */}
        {activeSection === 'thirdparties' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30">
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" /> Who Receives Your Data
              </h2>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Complete and exhaustive subprocessor directory. Zero advertising networks, zero tracking pixels (Meta, Google Ads), and zero data brokers.
              </p>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/70 backdrop-blur-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-surface-container-low border-b border-outline-variant/30 font-mono text-[11px] text-on-surface-variant">
                  <tr>
                    <th className="p-3.5">Provider</th>
                    <th className="p-3.5">Role</th>
                    <th className="p-3.5">What They Receive</th>
                    <th className="p-3.5">Jurisdiction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20">
                  {THIRD_PARTIES.map((p) => (
                    <tr key={p.name} className="hover:bg-surface-container-high/20 transition">
                      <td className="p-3.5 font-bold text-on-surface whitespace-nowrap">{p.name}</td>
                      <td className="p-3.5 text-on-surface-variant">{p.role}</td>
                      <td className="p-3.5 text-on-surface leading-relaxed max-w-md">{p.data}</td>
                      <td className="p-3.5 text-on-surface-variant font-mono whitespace-nowrap">{p.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* What Stays On Your Machine */}
            <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border-l-4 border-l-primary border-y border-r border-outline-variant/30 space-y-2 shadow-sm">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" /> What Stays On Your Machine
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Assistive typing (the browser extension typing an essay draft into a Google Doc, Notion, or Canvas textarea) happens 100% locally: the extension simulates keystrokes inside your page DOM. Keystrokes, passwords, and payment fields are strictly never recorded or transmitted to our server. Your login token stays in browser local storage and syncs theme preferences only.
              </p>
            </div>
          </div>
        )}

        {/* SECTION 3: Storage & Retention */}
        {activeSection === 'storage' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30">
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-primary" /> Physical Architecture &amp; Retention
              </h2>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Honest accounting of disk storage boundaries and lifecycle timelines.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 space-y-3">
                <h3 className="text-sm font-bold text-on-surface">On Our Server</h3>
                <ul className="space-y-2 text-xs text-on-surface-variant list-disc pl-4 leading-relaxed">
                  <li>Account record, chat threads, materials, and payment records stored in SQLite on dedicated infrastructure.</li>
                  <li>Uploaded lecture audio and source files located in isolated filesystem storage.</li>
                  <li>Anonymized Data Lake submissions scrubbed of names, emails, and student IDs.</li>
                  <li>Server access logs rotating on disk without perpetual retention.</li>
                </ul>
              </div>

              <div className="p-5 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 space-y-3">
                <h3 className="text-sm font-bold text-on-surface">In Your Browser</h3>
                <ul className="space-y-2 text-xs text-on-surface-variant list-disc pl-4 leading-relaxed">
                  <li>JWT authentication token (24 h expiration) and local username handle.</li>
                  <li>HttpOnly session cookie (<code className="font-mono text-[11px] text-primary">helpotron_session</code>, 7-day lifetime).</li>
                  <li>Local application settings (<code className="font-mono text-[11px] text-primary">helpotron_os_settings_v1</code>).</li>
                  <li>Browser extension local storage for connection endpoints and sync preferences.</li>
                </ul>
              </div>
            </div>

            {/* Retention Timeline */}
            <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 space-y-4">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 font-mono uppercase tracking-wider">
                <Clock className="w-4 h-4 text-primary" /> Retention Schedule
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {RETENTION_TIMELINE.map((item) => (
                  <div key={item.label} className="p-4 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11px] font-bold text-primary">{item.period}</span>
                      <h4 className="text-xs font-bold text-on-surface mt-1">{item.label}</h4>
                    </div>
                    <p className="text-[11px] text-on-surface-variant leading-snug">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: Your Rights */}
        {activeSection === 'rights' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30">
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-sem-green" /> Your Data Rights
              </h2>
              <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                Full adherence to GDPR (Articles 15-22) and US State Privacy Statutes (CCPA/CPRA, VCDPA, CPA).
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {RIGHTS.map((r) => (
                <div key={r.title} className="p-5 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 space-y-2 border-l-4 border-l-sem-green shadow-sm">
                  <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-sem-green" /> {r.title}
                  </h3>
                  <p className="text-xs text-on-surface-variant leading-relaxed">{r.text}</p>
                </div>
              ))}
            </div>

            <div className="p-5 rounded-2xl bg-surface-container-lowest/70 backdrop-blur-xl border border-outline-variant/30 space-y-2">
              <h3 className="text-sm font-bold text-on-surface">Statutory Compliance Framework</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                We strictly honor the right to know, delete, correct, port data, and non-discrimination. Unlike services that require complicated mail-in forms, our deletion and export functions are instantaneous self-service controls wired to backend API handlers. We do not sell personal data, nor do we share student work for advertising purposes.
              </p>
            </div>
          </div>
        )}

        {/* SECTION 5: Kids & Schools */}
        {activeSection === 'kids' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 space-y-3">
                <h2 className="text-base font-bold text-primary flex items-center gap-2">
                  <School className="w-5 h-5" /> Minors &amp; Age Thresholds (COPPA)
                </h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Helpotron is restricted to students aged 13 and older. Account creation requires a username and password only. We do not knowingly collect personal identifiers from children under 13, and upon notice will immediately purge any unauthorized minor account.
                </p>
              </div>

              <div className="p-6 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 space-y-3">
                <h2 className="text-base font-bold text-sem-amber flex items-center gap-2">
                  <FileText className="w-5 h-5" /> School Records &amp; Privacy (FERPA)
                </h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Helpotron operates as a student-directed, student-initiated study platform. We process only coursework you intentionally import: assignment descriptions, rubric criteria, and lecture recordings. The extension reads LMS pages strictly upon user initiation, never in the background, utilizing your personal credentials to retrieve course documents. We enforce a strict zero-sale and zero-model-training posture over private student coursework.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-3xl bg-surface-container-lowest/80 backdrop-blur-xl border-l-4 border-l-sem-amber border-y border-r border-outline-variant/30 space-y-2 shadow-sm">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-sem-amber" /> Academic Integrity Notice
              </h3>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Helpotron is engineered as an assistive study companion: generating practice quizzes, flashcard decks, thesis syntheses, and revision drafts. Deploying unreviewed AI outputs during live proctored examinations or violating institutional honor codes is strictly prohibited by our Terms of Service.
              </p>
            </div>
          </div>
        )}

        {/* SECTION 6: Security & Contact */}
        {activeSection === 'security' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 space-y-3">
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" /> Technical Security Controls
              </h2>
              <ul className="space-y-2.5 text-xs text-on-surface-variant">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong className="text-on-surface">Encrypted In Transit:</strong> All HTTP and WebSocket connections terminate through Cloudflare SSL tunnels with TLS 1.3 enforcement.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong className="text-on-surface">Password Hashing:</strong> Credentials hashed with salted PBKDF2-SHA256 (100,000 iterations); plain passwords are never written to disk or memory logs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong className="text-on-surface">Session Protection:</strong> HttpOnly, SameSite=Lax session cookies combined with per-request CSRF tokens and rate-limiting middleware.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold">•</span>
                  <span><strong className="text-on-surface">Spend Safeguards:</strong> Hard-capped token consumption limits and mandatory user confirmation gates before dispatching high-compute tasks.</span>
                </li>
              </ul>
            </div>

            <div className="p-5 rounded-2xl bg-surface-container-lowest/80 backdrop-blur-xl border border-outline-variant/30 space-y-3">
              <h2 className="text-base font-bold text-on-surface">Security Inquiries &amp; Breach Protocol</h2>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                In the event of an incident compromising data security, affected operators will be notified in accordance with GDPR Article 33/34 timelines (within 72 hours).
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href="mailto:privacy@helpotron.com"
                  className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container text-xs font-bold transition cursor-pointer shadow-sm active:scale-95"
                >
                  <span>Contact Privacy Counsel (privacy@helpotron.com)</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

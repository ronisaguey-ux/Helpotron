import React, { useState } from 'react';
import {
  Shield, Lock, FileText, CheckCircle2, Server, RefreshCw, ArrowLeft,
  Search, AlertTriangle, Database, Globe, UserCheck, Trash2, Smartphone,
  HardDrive, School, Mail
} from 'lucide-react';

/*
 * PrivacyPolicy.jsx — plain-English privacy policy for the Helpotron web app
 * and browser extension (mirrors /home/roni/Roni_workspace/helpotron/PRIVACY_POLICY.md,
 * which is served at /privacy-policy by server/routes_extension.py).
 *
 * Content was written from actual code behavior (09-05-2026): every row in the
 * tables below was checked against server/database.py, server/privacy.py,
 * server/routes_user_settings.py, server/llm.py, server/transcription.py,
 * server/payments.py, server/auth_2fa.py, server/trial_service.py,
 * server/datalake.py, web/src/api.js, web/src/demoData.js and
 * extension/manifest.json. Nothing is claimed that the code does not do.
 *
 * Export signature is intentionally unchanged: PrivacyPolicyView.jsx renders
 * <PrivacyPolicy onAgree={() => {}} /> and the consent modal flows (signup /
 * first login) are handled by PrivacyPolicyModal.jsx, not by this component.
 * onAgree is accepted for that contract but the agreement buttons live in the
 * modal — this page only renders the policy itself plus an optional back
 * button (onBack) so it can be opened from the Dashboard / Settings.
 */

const DATA_CATEGORIES = [
  { code: 'CAT-01', name: 'Account identity', elements: 'Username (public_id), display name, role, plan, credit balance, account creation date. No email is collected at signup.', retention: 'Until you delete the account', why: 'To sign you in and manage service' },
  { code: 'CAT-02', name: 'Login security', elements: 'PBKDF2 password hash + salt, 24-hour login token (JWT), 7-day database session, CSRF token, optional TOTP secret for app-based 2FA.', retention: 'Sessions expire after 7 days; password hash stays until deletion', why: 'To keep your account secure' },
  { code: 'CAT-03', name: 'Phone & SMS', elements: 'Your phone number if you add SMS two-factor; free-trial phone numbers stored only as a SHA-256 hash plus masked number and claim IP.', retention: 'Until you remove 2FA or delete the account; trial hashes kept for abuse prevention', why: 'To send 2FA/verification codes and to stop trial abuse' },
  { code: 'CAT-04', name: 'Coursework', elements: 'Assignment titles, prompts, due dates, course names; Canvas-sync data; pages you scrape with the extension (URL, title, prompt, rubric text, file links + SHA-256, and file bytes up to 6 MB each where fetchable).', retention: 'Until you delete the account', why: 'To do the work with the agent' },
  { code: 'CAT-05', name: 'Study materials', elements: 'Generated study guides, flashcard sets, practice tests, summaries, writing drafts, Anki/Quizlet exports.', retention: 'Until you delete the account', why: 'They are the product you asked for' },
  { code: 'CAT-06', name: 'Audio & transcripts', elements: 'Lecture recordings you make with the extension recorder (microphone audio) and the transcripts the AI writes from them.', retention: 'Audio files and transcripts until you delete the account', why: 'To transcribe and summarize your lectures' },
  { code: 'CAT-07', name: 'Agent chat & memory', elements: 'Chat threads and messages, the agent\'s long-term memory notes, files you upload to the agent, executed agent actions, optional Telegram linking.', retention: 'Until you delete the account', why: 'To keep your assistant continuous' },
  { code: 'CAT-08', name: 'Screen frames', elements: 'One compressed JPEG frame (longest side up to 1280 px) of the tab you pick, sent ONLY while the extension\'s "See screen" switch is on.', retention: 'Used for the current turn only; not stored in your account', why: 'To let the agent see the page you are looking at' },
  { code: 'CAT-09', name: 'Preferences & settings', elements: 'Theme, accent, effort level, scoped rule overrides, custom subjects/bubbles, writing style samples. Saved in your browser AND mirrored to your account.', retention: 'Until you delete the account or clear browser data', why: 'To remember how you like to work' },
  { code: 'CAT-10', name: 'Billing & credits', elements: 'Stripe customer/subscription IDs, credit transaction ledger, manual payment records (provider, reference, amount). Card numbers are never sent to or stored by us.', retention: 'Until you delete the account', why: 'To grant and invoice credits' },
  { code: 'CAT-11', name: 'Referrals & study groups', elements: 'Referral codes and reward allocations; study group titles, rosters, shared material pointers.', retention: 'Until you delete the account or leave the group', why: 'To run these features' },
  { code: 'CAT-12', name: 'Telemetry & logs', elements: 'Anonymized data-lake events (detection scores, write-outcome metrics — PII scrubbed, user IDs hashed), API usage ledger (tokens and cost per user, no message contents), rotating access logs (request line, client IP as seen behind the tunnel, status).', retention: 'Logs rotate on the server; usage rows until deletion', why: 'To improve the product and keep it running' },
];

const THIRD_PARTIES = [
  { name: 'OpenRouter (AI model gateway)', role: 'All AI text generation, vision, and audio transcription', data: 'Your prompts, chat messages, assignment content, study files, transcripts, screen frames and audio go to OpenRouter, which serves DeepSeek and Google Gemini models to us. We never call OpenAI or Anthropic.', location: 'United States' },
  { name: 'Cloudflare (tunnel + Turnstile)', role: 'Public host helpotron.dpdns.org, the encrypted tunnel into our server, and the Turnstile human-check on signup/login', data: 'Proxy metadata (IP address, request headers, TLS details) and the Turnstile token you solve; no study content', location: 'Global edge network' },
  { name: 'Stripe', role: 'Subscription checkout (used when Stripe is configured)', data: 'Checkout details and billing name/email you supply in the checkout; we store only the Stripe customer and subscription IDs. Card details never touch our servers.', location: 'United States / Ireland' },
  { name: 'Twilio', role: 'SMS delivery for two-factor login and phone recovery codes', data: 'Your phone number and the one-time code', location: 'United States' },
  { name: 'Google', role: 'Gemini models (served via OpenRouter) for transcription; your own Google Docs when you use "Launch to Doc"', data: 'Audio for transcription via OpenRouter. For Launch to Doc: the text we return to your browser is typed into the Google Doc you chose by the extension — it goes to Google under YOUR account, as ordinary editing.', location: 'United States' },
  { name: 'Telegram', role: 'Optional: connect your agent to your own Telegram bot', data: 'Conversations you send/receive only if you connect it; messages pass through Telegram\'s servers. Recovery fallback may also notify our operator via the admin Telegram chat.', location: 'Telegram servers' },
  { name: 'Your school\'s LMS', role: 'Canvas, Blackboard, D2L, Moodle, Schoology, etc. — only when you connect them', data: 'We talk to your school\'s servers with YOUR access token to pull course/assignment data. We never read LMS pages in the background.', location: 'Wherever your school hosts it' },
];

const RIGHTS = [
  { title: 'Access & portability', text: 'Settings → Data → Export All downloads the JSON export of everything your account holds (settings, materials, assignments, data-lake contributions). You can also export individual assignments or bubbles, and generate Anki .apkg or Quizlet files.' },
  { title: 'Erasure', text: 'Settings → Account → Delete Account (or API call DELETE /api/user/account) wipes your user row plus every related table — assignments, transcripts, materials, chat, file records, payments ledger, referrals, sessions — in one transaction. It is immediate and not reversible.' },
  { title: 'Correction', text: 'Change your username data? Account fields are editable in Settings; write style samples, custom subjects and rule overrides can each be corrected or removed there.' },
  { title: 'Reset without deleting', text: 'Settings → Data → Soft Reset restores preferences to defaults and archives unfinished staging — nothing is deleted, so it is reversible.' },
  { title: 'Formal requests', text: 'privacy@helpotron.com — we will confirm the request, verify ownership, and fulfil it within the timelines required by the GDPR (Art. 12-23) and US state laws. We never sell data and do not use it for advertising.' },
];

export default function PrivacyPolicy({ onBack, onAgree }) {
  const [activeTab, setActiveTab] = useState('inventory');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredCategories = DATA_CATEGORIES.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.elements.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 space-y-8 text-[var(--text-primary)] font-sans">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      )}

      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] pb-6 space-y-3">
        <div className="flex items-center gap-2 text-[var(--accent)] text-xs font-mono font-bold uppercase tracking-wider">
          <Shield className="w-4 h-4" /> Privacy &amp; Your Data
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Helpotron Privacy Policy
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span><strong>Last reviewed:</strong> September 5, 2026</span>
          <span>&bull;</span>
          <span><strong>Applies to:</strong> the web app, the browser extension, and this server</span>
          <span>&bull;</span>
          <span><strong>Contact:</strong> privacy@helpotron.com</span>
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed pt-1">
          Short version: we keep your study data to run the service. The AI features send your
          prompts, study content, and (only while you turn it on) screen frames to OpenRouter —
          which serves DeepSeek and Google Gemini models — to generate your material. We never
          sell data, we run no ad trackers, and you can export everything or delete your account
          in two clicks from Settings.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-3">
        {[
          { id: 'inventory', label: '1. What we collect', icon: Database },
          { id: 'thirdparties', label: '2. AI & third parties', icon: Server },
          { id: 'storage', label: '3. Storage & retention', icon: HardDrive },
          { id: 'rights', label: '4. Your rights', icon: UserCheck },
          { id: 'kids', label: '5. Kids & schools', icon: School },
          { id: 'security', label: '6. Security & contact', icon: Lock },
        ].map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/40 shadow-sm'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Data inventory */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-5">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">What we store, in plain English</h2>
              <p className="text-xs text-[var(--text-secondary)]">Every bucket below was checked against the running code. "Until you delete the account" means it is removed when you use the Delete Account button — deletion really does wipe the row and everything attached to it.</p>
            </div>
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter categories or fields..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg pl-9 pr-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-b border-[var(--border-subtle)] font-mono">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">What we store</th>
                  <th className="p-3">How long</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredCategories.map(cat => (
                  <tr key={cat.code} className="hover:bg-[var(--bg-surface-elevated)]/60 transition">
                    <td className="p-3 font-mono font-bold text-indigo-400">{cat.code}</td>
                    <td className="p-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">{cat.name}</td>
                    <td className="p-3 text-[var(--text-secondary)] leading-relaxed">{cat.elements}<div className="text-[11px] text-[var(--text-muted)] mt-1">{cat.why}</div></td>
                    <td className="p-3 text-[var(--text-muted)] whitespace-nowrap">{cat.retention}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: AI & third parties */}
      {activeTab === 'thirdparties' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Server className="w-5 h-5 text-purple-400" /> Who actually receives your data
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              This is the complete list. There are no analytics or advertising third parties:
              no Meta pixel, no Google Analytics, no ad networks, and no data sales. If your
              study content ever leaves our server it goes to one of the providers below,
              and only to deliver the specific feature you are using.
            </p>
          </div>

          <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-b border-[var(--border-subtle)] font-mono">
                <tr>
                  <th className="p-3">Provider</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">What they receive</th>
                  <th className="p-3">Where</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {THIRD_PARTIES.map(sub => (
                  <tr key={sub.name} className="hover:bg-[var(--bg-surface-elevated)]/60 transition">
                    <td className="p-3 font-bold text-[var(--text-primary)] whitespace-nowrap">{sub.name}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{sub.role}</td>
                    <td className="p-3 text-[var(--text-secondary)] leading-relaxed">{sub.data}</td>
                    <td className="p-3 text-[var(--text-muted)] whitespace-nowrap">{sub.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-panel p-6 border-l-4 border-l-purple-500 space-y-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">What stays on your machine</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Assistive typing (the extension typing a draft into a Google Doc, Gmail, Notion or
              any text field you pick) happens locally: the extension dispatches keystrokes inside
              the page. Keystrokes and the contents of password, OTP and card fields are never sent
              to our server. The extension also keeps your login token and a recent-chat mirror in
              its own browser storage, and syncs only your theme and accent color through your
              browser profile. Without the extension, the web app runs entirely off the server at
              helpotron.dpdns.org — your browser does not phone home anywhere else.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Storage & retention */}
      {activeTab === 'storage' && (
        <div className="space-y-6">
          <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-400" /> Where things live, and for how long
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel p-6 space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">On our server</h3>
              <ul className="space-y-2 text-xs text-[var(--text-secondary)] list-disc pl-4">
                <li>Your account row and every study/chat/transcript/material/payment record: a SQLite database on our machine.</li>
                <li>Uploaded files (agent files, avatars, scraped assignment files, recordings) in the uploads directory on the same machine.</li>
                <li>Anonymized data-lake events: PII- and ID-scrubbed writeups in JSON files (emails, phone numbers, IDs and names are redacted, your user ID is replaced by a salted hash).</li>
                <li>Access/error logs in <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded text-indigo-400">data/logs/</code> — rotating files including request lines and client IP as seen behind the tunnel.</li>
              </ul>
            </div>
            <div className="glass-panel p-6 space-y-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">In your browser</h3>
              <ul className="space-y-2 text-xs text-[var(--text-secondary)] list-disc pl-4">
                <li>Web app: login token (24 h), your username, a CSRF mirror, the settings object (<code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded">helpotron_os_settings_v1</code>), terms-acceptance flag, custom agent skills/identities, optional alternate-server URL.</li>
                <li>Cookies: <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded">helpotron_session</code> (HttpOnly, 7 days, SameSite=Lax, Secure when you are on https) and <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded">csrf_token</code>.</li>
                <li>Extension: <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded">chrome.storage.local</code> for the server URL, username and session token (cleared on sign-out); <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded">chrome.storage.sync</code> for theme + accent color only.</li>
              </ul>
            </div>
          </div>

          <div className="glass-panel p-6 space-y-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Retention, honestly stated</h3>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)] list-disc pl-4">
              <li>Login tokens: expire after 24 h. Server sessions and the login cookie: expire after 7 days.</li>
              <li>Verification codes (2FA, phone recovery): single-use, expire within 15-30 minutes.</li>
              <li>Study content, chats, transcripts, payments ledger, referrals, settings: kept for as long as you keep the account — there is no silent auto-deletion, and there is no rolling 90-day chat window.</li>
              <li>Free-trial phone numbers: retained only as salted SHA-256 hashes plus a masked form and the claim IP, solely to stop duplicate trials.</li>
              <li>If Stripe is enabled, Stripe keeps its own customer/charge records under its terms; our copy (IDs only) is deleted with your account.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab 4: Your rights */}
      {activeTab === 'rights' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" /> Your rights, and the buttons that back them
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Two of these rights are real buttons in Settings — Export All and Delete Account —
              and both are wired to server endpoints that do exactly what they say.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {RIGHTS.map(r => (
              <div key={r.title} className="glass-panel p-5 space-y-2 border-l-4 border-l-emerald-500/60">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {r.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{r.text}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <a
              href="mailto:privacy@helpotron.com?subject=Data%20Subject%20Request"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
            >
              <Mail className="w-4 h-4" /> Submit a Data Subject Request (privacy@helpotron.com)
            </a>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              <RefreshCw className="w-4 h-4" /> Export All = Settings → Data → Export All
            </span>
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
              <Trash2 className="w-4 h-4" /> Delete = Settings → Account → Delete Account
            </span>
          </div>

          <div className="glass-panel p-6 space-y-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Laws we follow</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              GDPR / UK GDPR: rights of access (Art. 15), rectification (16), erasure (17),
              restriction (18), portability (20), plus the right to object to processing for
              telemetry and the right not to be subject to fully-automated decisions. US state
              laws (CCPA/CPRA, VCDPA, CPA, CTDPA, TDPSA): the right to know, delete, correct,
              portability and non-discrimination — and here, unlike many products, the delete
              right is a working button rather than a form. We do not sell or share personal
              data for cross-context behavioral advertising, and no such sharing exists to opt
              out of.
            </p>
          </div>
        </div>
      )}

      {/* Tab 5: Kids & schools */}
      {activeTab === 'kids' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel p-6 space-y-3">
              <h2 className="text-base font-bold text-emerald-400 flex items-center gap-2">
                <School className="w-5 h-5" /> Minors (COPPA)
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Helpotron is restricted to people aged 13 and over. Signup asks for a username
                and password only, but we do not knowingly collect personal information from
                children under 13, and if you believe a child under 13 has an account, contact
                us and we will erase it.
              </p>
            </div>

            <div className="glass-panel p-6 space-y-3">
              <h2 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <FileText className="w-5 h-5" /> Your school records (FERPA)
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                We store only what you bring: assignment pages you choose to scrape, files you
                upload, and audio you record. The browser extension reads an LMS page only when
                you start a capture, never in the background, and it sends you to your own
                school's servers with your own credentials when it fetches course files. Your
                records belong to you; use of personal materials for private study review is
                your responsibility under your institution's policy.
              </p>
            </div>
          </div>

          <div className="glass-panel p-6 space-y-2 border-l-4 border-l-amber-500">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Academic integrity
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Helpotron is built for study review: generating flashcards, guides and practice
              tests, and drafting work for you to revise. Submitting unreviewed AI output during
              live proctored exams or otherwise outside your school's policy is prohibited by our
              Terms of Service. We do not help you hide AI use from schools — the detector
              scoring in your dashboard is a risk meter for transparency, not a concealing tool.
            </p>
          </div>
        </div>
      )}

      {/* Tab 6: Security & contact */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" /> How your data is protected
            </h2>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
              <li><strong>In transit:</strong> the whole public site (and every request to it) runs through an encrypted Cloudflare tunnel to our server — no plain-HTTP study content travels the internet.</li>
              <li><strong>Passwords:</strong> never stored in plain text — salted PBKDF2-SHA256 with 100,000 iterations.</li>
              <li><strong>Sessions:</strong> HttpOnly, SameSite=Lax cookie plus a DB-backed server session; CSRF tokens on every state-changing request; optional TOTP app or SMS two-factor.</li>
              <li><strong>Abuse controls:</strong> Cloudflare Turnstile on signup/login, rate limiting, per-user cost budgets and approvals before the agent spends anything or submits work.</li>
              <li><strong>Honest limits:</strong> we store the database and uploads on our own machine's disk — we do not claim encryption of data at rest, and authorization to inspect data belongs to the account owner and the platform operator who keeps the service running.</li>
            </ul>
          </div>

          <div className="glass-panel p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)]">Breach notification &amp; policy changes</h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              If a breach puts your data at risk we will tell you what happened and what we did
              as required by GDPR Article 33 (authorities, 72 h) and Article 34 (users, without
              undue delay), and by US state breach statutes. If we ever change this policy we
              will update the date at the top, and if a change reduces your rights we will
              say so prominently before it takes effect.
            </p>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Questions, requests, or a wish to exercise any right: <strong>privacy@helpotron.com</strong>
              — or use the message-to-admin channel inside the app. The machine-readable version
              of this policy is always served at <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded text-indigo-400">/privacy-policy</code> on the site root.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Shield, Lock, FileText, CheckCircle2, Server, RefreshCw, ArrowLeft, 
  Search, Phone, AlertTriangle, Database, Globe, UserCheck, Key, Clock
} from 'lucide-react';

const DATA_CATEGORIES = [
  { code: 'CAT-01', name: 'Account Identity', elements: 'Public ID, username, email, Telegram ID (optional), role, creation timestamps', retention: 'Account lifetime + 30 days', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-02', name: 'Authentication Secrets', elements: 'Salted scrypt/PBKDF2 password hashes, session JWTs, device fingerprints, TOTP seed secrets', retention: 'Hashes: Account life. Sessions: 30d. Resets: 15m', basis: 'Legitimate Interest (Art. 6(1)(f))' },
  { code: 'CAT-03', name: 'Telephony & 2FA Signals', elements: 'E.164 phone numbers, 6-digit verification OTPs, claimed trial hashes', retention: 'Trial hashes: 365d. OTPs: 15-minute TTL', basis: 'Consent (Art. 6(1)(a)) / Fraud Prevention' },
  { code: 'CAT-04', name: 'Academic Coursework', elements: 'Canvas assignment IDs, titles, due dates, grading rubrics, prompt HTML/text', retention: 'Account lifetime or user deletion', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-05', name: 'Study Synthesis Artifacts', elements: 'Flashcards, study packs, practice quizzes, writing drafts, Anki .apkg packages', retention: 'Account lifetime or user deletion', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-06', name: 'Audio & Transcripts', elements: 'Uploaded lecture audio, automated text transcriptions, AI summaries, speaker tags', retention: 'Account lifetime or user deletion', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-07', name: 'Agent Chat Dialogues', elements: 'Interactive chat threads, system instructions, token counts, autonomous tools executed', retention: '90-day rolling window or account deletion', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-08', name: 'Workspace Knowledge Files', elements: 'Uploaded PDF/Word documents, reference files, custom skill definitions, persona markdown', retention: 'Account lifetime or user deletion', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-09', name: 'Hierarchical Settings', elements: 'Scoping parameters across 7 tiers (task, teacher, subject, global), theme toggles', retention: 'Account lifetime', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-10', name: 'Billing & Commercial Ledger', elements: 'Stripe Customer ID, subscription ID, amount cents, credit transactions ledger', retention: '7 years (statutory financial/tax)', basis: 'Legal Obligation (Art. 6(1)(c))' },
  { code: 'CAT-11', name: 'Referral Program Tracking', elements: 'Referral codes, referring user ID, referee user ID, reward credit allocations', retention: '2 years post-referral completion', basis: 'Legitimate Interest (Art. 6(1)(f))' },
  { code: 'CAT-12', name: 'Study Group Collaboration', elements: 'Group titles, member rosters, shared study note pointers, study timestamps', retention: 'Duration of group activity / deletion', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-13', name: 'Institutional Organizations', elements: 'School/team name, seat quotas, admin ID, domain verification settings', retention: 'Duration of organization contract + 90d', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-14', name: 'Data Lake (Opt-In Only)', elements: 'Anonymized writing samples, humanizer quality ratings (direct PII scrubbed)', retention: 'Retained in pseudonymized form', basis: 'Explicit Consent (Art. 6(1)(a))' },
  { code: 'CAT-15', name: 'Browser Extension Signals', elements: 'Active tab URL (Canvas/GDocs), DOM assignment containers, keystroke pacing config', retention: 'Local browser storage / extension session', basis: 'Contract (Art. 6(1)(b))' },
  { code: 'CAT-16', name: 'Telemetry & Access Logs', elements: 'Truncated IP address, User-Agent, endpoint, latency ms, Cloudflare Turnstile tokens', retention: '30 days rolling automatic rotation', basis: 'Security / Legitimate Interest' },
];

const SUBPROCESSORS = [
  { name: 'OpenRouter, Inc.', role: 'AI Model Gateway & Token Dispatch', data: 'Prompt text, assignment context, token allocation limits', location: 'United States', terms: 'Zero Data Retention / Standard Contractual Clauses' },
  { name: 'DeepSeek AI', role: 'Mathematical Reasoning & Code Execution', data: 'Anonymized math prompts, programming syntax', location: 'US Gateway / Global', terms: 'Enterprise API Terms (Zero Training Guarantee)' },
  { name: 'Google Cloud (Gemini)', role: 'Audio Transcription & Multimodal Vision', data: 'Lecture audio recordings, image payloads for OCR', location: 'United States', terms: 'EU-US Data Privacy Framework / ISO 27001' },
  { name: 'Cloudflare, Inc.', role: 'CDN, DDoS Defense, WAF, Turnstile Captcha', data: 'Client IP address, HTTP headers, Turnstile tokens', location: 'Global Edge Network', terms: 'EU-US Data Privacy Framework / SOC 2 Type II' },
  { name: 'Twilio Inc.', role: 'SMS 2FA Authentication Delivery', data: 'E.164 phone numbers, 6-digit verification OTPs', location: 'United States', terms: 'Twilio Binding Corporate Rules (BCRs) / A2P 10DLC' },
  { name: 'Stripe, Inc.', role: 'Payment Card Processing & Subscriptions', data: 'Card tokens, billing name/zip, transaction history', location: 'United States & Ireland', terms: 'PCI-DSS Level 1 / Binding Corporate Rules' },
];

export default function PrivacyPolicy({ onBack }) {
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
          <Shield className="w-4 h-4" /> Institutional Data Protection &amp; Statutory Governance
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Helpotron Global Privacy Policy
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span><strong>Effective Date:</strong> August 31, 2026</span>
          <span>&bull;</span>
          <span><strong>Entity:</strong> Helpotron, LLC (Louisiana, USA)</span>
          <span>&bull;</span>
          <span><strong>Contact:</strong> privacy@helpotron.com</span>
        </div>
        <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed pt-1">
          Compliant with Regulation (EU) 2016/679 (GDPR), UK Data Protection Act 2018, California Consumer Privacy Act (CCPA/CPRA), US Multi-State Privacy Frameworks, Telephone Consumer Protection Act (TCPA), and European Union Artificial Intelligence Act (Regulation (EU) 2024/1689).
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-3">
        {[
          { id: 'inventory', label: '1. Data Inventory (16 Types)', icon: Database },
          { id: 'subprocessors', label: '2. Subprocessors & AI', icon: Server },
          { id: 'rights', label: '3. Statutory Rights & GDPR', icon: CheckCircle2 },
          { id: 'telephony', label: '4. SMS 2FA & TCPA', icon: Phone },
          { id: 'academic', label: '5. Academic Ethics & Minors', icon: FileText },
          { id: 'security', label: '6. Security & Breach Protocol', icon: Lock },
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

      {/* Tab 1: Data Inventory */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-panel p-5">
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">Personal Data Category Schedule</h2>
              <p className="text-xs text-[var(--text-secondary)]">Complete mapping of all 16 data categories collected, stored, and processed across Helpotron systems.</p>
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
                  <th className="p-3">Specific Elements</th>
                  <th className="p-3">Retention Period</th>
                  <th className="p-3">Lawful Basis (GDPR Art. 6)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredCategories.map(cat => (
                  <tr key={cat.code} className="hover:bg-[var(--bg-surface-elevated)]/60 transition">
                    <td className="p-3 font-mono font-bold text-indigo-400">{cat.code}</td>
                    <td className="p-3 font-semibold text-[var(--text-primary)] whitespace-nowrap">{cat.name}</td>
                    <td className="p-3 text-[var(--text-secondary)] leading-relaxed">{cat.elements}</td>
                    <td className="p-3 text-[var(--text-muted)] whitespace-nowrap">{cat.retention}</td>
                    <td className="p-3 text-emerald-400 font-mono text-[11px] whitespace-nowrap">{cat.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Subprocessors & AI */}
      {activeTab === 'subprocessors' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Server className="w-5 h-5 text-purple-400" /> Third-Party Subprocessors &amp; Cross-Border Transfers
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Helpotron partners with vetted enterprise cloud providers to deliver scalable AI inference, audio transcription, edge delivery, and billing. All subprocessors maintain GDPR Article 28 Data Processing Agreements and strict technical safeguards.
            </p>
          </div>

          <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-b border-[var(--border-subtle)] font-mono">
                <tr>
                  <th className="p-3">Vendor / Entity</th>
                  <th className="p-3">Role &amp; Service</th>
                  <th className="p-3">Data Shared</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Transfer Safeguard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {SUBPROCESSORS.map(sub => (
                  <tr key={sub.name} className="hover:bg-[var(--bg-surface-elevated)]/60 transition">
                    <td className="p-3 font-bold text-[var(--text-primary)] whitespace-nowrap">{sub.name}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{sub.role}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{sub.data}</td>
                    <td className="p-3 text-[var(--text-muted)] whitespace-nowrap">{sub.location}</td>
                    <td className="p-3 text-emerald-400 font-semibold text-[11px] whitespace-nowrap">{sub.terms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="glass-panel p-6 border-l-4 border-l-purple-500 space-y-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">Strict Zero Public Foundation Model Training Guarantee</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Under our enterprise API covenants with OpenRouter, DeepSeek, and Google Cloud, your submitted homework prompts, lecture transcripts, and uploaded study files are <strong>never</strong> utilized to train, retrain, or adjust the weights of public foundation artificial intelligence models.
            </p>
          </div>
        </div>
      )}

      {/* Tab 3: Statutory Rights */}
      {activeTab === 'rights' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel p-6 space-y-3">
              <h2 className="text-base font-bold text-indigo-400 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> GDPR &amp; UK GDPR Rights (EEA/UK)
              </h2>
              <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                <li><strong>Art. 15 (Right to Access):</strong> Obtain confirmation and copies of all personal data held about you.</li>
                <li><strong>Art. 16 (Right to Rectification):</strong> Update inaccurate or incomplete academic profile information.</li>
                <li><strong>Art. 17 (Right to Erasure):</strong> Permanent one-click deletion of all account rows via <code className="bg-[var(--bg-surface)] px-1 py-0.5 rounded text-indigo-400">DELETE /user/account</code>.</li>
                <li><strong>Art. 18 (Restriction of Processing):</strong> Freeze data processing pending dispute resolution.</li>
                <li><strong>Art. 20 (Data Portability):</strong> Export your study sets, cards, and transcripts in machine-readable JSON.</li>
              </ul>
            </div>

            <div className="glass-panel p-6 space-y-3">
              <h2 className="text-base font-bold text-emerald-400 flex items-center gap-2">
                <Globe className="w-5 h-5" /> US Multi-State Privacy Rights (CCPA/CPRA, etc.)
              </h2>
              <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                <li><strong>California (CCPA/CPRA):</strong> Right to know, delete, correct, limit sensitive data, and non-discrimination.</li>
                <li><strong>Virginia (VCDPA) &amp; Colorado (CPA):</strong> Right to access, correct, delete, portability, and universal opt-out.</li>
                <li><strong>Connecticut (CTDPA) &amp; Texas (TDPSA):</strong> Comprehensive consumer request fulfillment within 45 days.</li>
                <li><strong>Zero Sale / Zero Sharing:</strong> Helpotron <strong>does not sell</strong> or share your personal data for cross-context behavioral advertising.</li>
              </ul>
            </div>
          </div>

          <div className="glass-panel p-6 space-y-3 bg-indigo-950/20 border border-indigo-500/30">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-400" /> How to Exercise Your Data Subject Rights
            </h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              To exercise statutory rights:
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="mailto:privacy@helpotron.com?subject=Data%20Subject%20Request"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition"
              >
                Submit DSR Request (privacy@helpotron.com)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Telephony & TCPA */}
      {activeTab === 'telephony' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-bold uppercase">
              <Phone className="w-4 h-4" /> TCPA &amp; CTIA A2P 10DLC Compliance
            </div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">
              Telephone Consumer Protection Act (TCPA) &amp; SMS 2FA Disclosures
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Helpotron provides optional SMS two-factor authentication to secure student accounts and verify single-use promotional free trials.
            </p>

            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4 space-y-2 text-xs">
              <div className="font-bold text-[var(--text-primary)]">Mandatory SMS Program Summary:</div>
              <ul className="list-disc pl-5 space-y-1 text-[var(--text-secondary)]">
                <li><strong>Purpose:</strong> Phone numbers are collected <strong>exclusively</strong> to deliver security verification OTP codes.</li>
                <li><strong>Non-Marketing Guarantee:</strong> Helpotron will <strong>never</strong> send promotional, advertising, or automated marketing text messages.</li>
                <li><strong>Frequency:</strong> Recurring strictly per user login challenge (typically 1 text per authentication session).</li>
                <li><strong>Standard Rates:</strong> Message and data rates may apply per your mobile carrier plan.</li>
                <li><strong>STOP / Opt-Out:</strong> Text <strong>STOP</strong> at any time to unenroll from SMS verification.</li>
                <li><strong>HELP / Support:</strong> Text <strong>HELP</strong> for support or email <span className="text-indigo-400">support@helpotron.com</span>.</li>
                <li><strong>Carrier Disclaimer:</strong> Mobile carriers are not liable for delayed or undelivered messages.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Academic Ethics & Minors */}
      {activeTab === 'academic' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel p-6 space-y-3">
              <h2 className="text-base font-bold text-emerald-400 flex items-center gap-2">
                <FileText className="w-5 h-5" /> Academic Integrity &amp; Student Responsibility
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Helpotron is engineered as an autonomous study synthesizer, flashcard generator, and research accelerator. It is strictly designed for personal study review. Direct submission of unreviewed AI outputs during live proctored examinations or unauthorized assessments is strictly prohibited by our Terms of Service.
              </p>
            </div>

            <div className="glass-panel p-6 space-y-3">
              <h2 className="text-base font-bold text-amber-400 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" /> Protection of Minors (COPPA &amp; FERPA)
              </h2>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                <strong>COPPA (15 U.S.C. § 6501):</strong> Helpotron is strictly restricted to individuals aged <strong>13 and older</strong>. We do not knowingly collect personal data from children under 13.<br /><br />
                <strong>FERPA (34 CFR Part 99):</strong> Helpotron operates as a private student productivity software. In the direct-to-consumer deployment, students warrant the legal authority to utilize their syllabus and coursework for fair use study review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Security & Breach Protocol */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-3">
            <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" /> Enterprise Security Safeguards
            </h2>
            <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
              <li><strong>TLS 1.3 Encryption:</strong> All client-to-server and server-to-subprocessor traffic is encrypted in transit with strict HSTS preloading.</li>
              <li><strong>AES-256 Storage:</strong> Database volumes and object storage pointers are encrypted at rest.</li>
              <li><strong>Salted Cryptographic Hashing:</strong> Passwords hashed using modern memory-hard key derivation (<code className="text-indigo-400">scrypt</code> / <code className="text-indigo-400">PBKDF2</code>).</li>
              <li><strong>Statutory 72-Hour Breach Notification:</strong> In the event of a confirmed breach of unencrypted personal data, Helpotron notifies relevant supervisory authorities within 72 hours under GDPR Article 33 and affected users without undue delay.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

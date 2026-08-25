import React, { useState } from 'react';

const SUBPROCESSORS = [
  { name: 'OpenRouter, Inc.', purpose: 'AI model orchestration, dynamic LLM token generation and inference dispatching', country: 'United States', link: 'https://openrouter.ai/privacy' },
  { name: 'Google Cloud Platform & DeepMind', purpose: 'Lecture audio transcription, multimodal vision analysis, and cloud infrastructure hosting', country: 'United States', link: 'https://policies.google.com/privacy' },
  { name: 'DeepSeek AI', purpose: 'Autonomous reasoning, mathematics execution and code generation', country: 'Global / US Proxy', link: 'https://deepseek.com/privacy' },
  { name: 'Stripe, Inc.', purpose: 'PCI-DSS Level 1 compliant payment gateway, recurring subscription billing, and fraud mitigation', country: 'United States', link: 'https://stripe.com/privacy' },
  { name: 'Twilio, Inc.', purpose: 'Two-factor authentication (2FA) SMS dispatching and account security verification', country: 'United States', link: 'https://twilio.com/legal/privacy' },
  { name: 'Cloudflare, Inc.', purpose: 'DDoS mitigation, web application firewall (WAF), Edge SSL termination, and content delivery', country: 'United States', link: 'https://cloudflare.com/privacypolicy' },
];

export default function PrivacyPolicyModal({ isOpen, onClose, onAccept, onDecline, requireMandatoryAgreement = false }) {
  const [tab, setTab] = useState('terms');
  const [hasScrolledTerms, setHasScrolledTerms] = useState(false);
  const [acceptedCheckbox, setAcceptedCheckbox] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Privacy Policy & Terms of Service"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[#0c1220] border border-white/15 rounded-3xl p-5 sm:p-8 flex flex-col justify-between shadow-2xl text-slate-100 overflow-hidden relative"
        data-modal-container
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 shrink-0">
          <div>
            <h2 className="text-base sm:text-xl font-bold text-white flex items-center gap-2">
              📜 Helpotron Legal Agreement &amp; Privacy Policy
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Governing Academic Terms of Service, FERPA Compliance, GDPR Article 17, and AI Data Processing.
            </p>
          </div>
          {!requireMandatoryAgreement && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto py-3 border-b border-white/8 shrink-0">
          {[
            { id: 'terms', label: '1. Terms of Service & Honor Code' },
            { id: 'ferpa', label: '2. FERPA & Student Privacy' },
            { id: 'gdpr', label: '3. GDPR & Statutory Rights' },
            { id: 'subprocessors', label: '4. AI Subprocessors & Models' },
            { id: 'billing', label: '5. Credits, Payments & Billing' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                tab === t.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Legal Body */}
        <div
          className="flex-1 overflow-y-auto my-4 pr-2 space-y-4 text-xs text-slate-300 leading-relaxed max-h-[50vh] border border-white/5 p-4 rounded-2xl bg-slate-950/60"
          onScroll={() => setHasScrolledTerms(true)}
        >
          {tab === 'terms' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-blue-400">
                1. Acceptance of Terms &amp; Academic Integrity Standard
              </h3>
              <p>
                By creating an account, accessing, or utilizing the Helpotron platform, Chrome Extension, API endpoints, or autonomous study agents (collectively, the &quot;Services&quot;), you enter into a legally binding agreement with Helpotron Automator Inc. (&quot;Helpotron&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;).
              </p>
              <h4 className="font-semibold text-white">1.1 Academic Honor Code &amp; Ethical Assistance</h4>
              <p>
                Helpotron is designed strictly as an automated supplementary academic operating system, study accelerator, and research assistant. You expressly acknowledge and warrant that:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>You will use the platform in strict accordance with your academic institution&apos;s student code of conduct, honor code, and course-specific syllabi regarding artificial intelligence tooling.</li>
                <li>You are solely responsible for verifying the factual accuracy, citations, calculations, and originality of all generated study guides, practice tests, and mathematical solutions.</li>
                <li>You shall not misrepresent autonomous agent synthesis as unassisted independent human work in violation of proctored examinations or honor examinations.</li>
              </ul>
              <h4 className="font-semibold text-white">1.2 Account Ownership &amp; Authentication Safeguards</h4>
              <p>
                Each student account is strictly personal and non-transferable. You agree to safeguard your authentication credentials, session cookies, and 2FA tokens. Any unauthorized activity conducted through your authenticated session is your legal responsibility. Helpotron reserves the right to immediately terminate or suspend any account engaged in credential sharing, automated scraping, or security evasion attempts.
              </p>
              <h4 className="font-semibold text-white">1.3 Limitation of Liability &amp; Warranty Disclaimer</h4>
              <p>
                THE SERVICES ARE PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. HELPOTRON DOES NOT WARRANT THAT STUDY MATERIALS OR GENERATED CALCULATIONS WILL BE ERROR-FREE OR THAT THE PLATFORM WILL MEET SPECIFIC GRADE OUTCOMES. IN NO EVENT SHALL HELPOTRON BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES.
              </p>
            </div>
          )}

          {tab === 'ferpa' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-blue-400">
                2. FERPA &amp; Student Educational Record Protection
              </h3>
              <p>
                Helpotron adheres to the statutory guidelines set forth by the Family Educational Rights and Privacy Act (FERPA) (34 CFR Part 99) and state educational privacy standards.
              </p>
              <h4 className="font-semibold text-white">2.1 Client-Side De-Identification &amp; PII Scrubbing</h4>
              <p>
                When you connect your Canvas LMS or upload coursework assignments, our automated intake filters execute deterministic redaction heuristics to strip Personally Identifiable Information (PII), including:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Student ID numbers, Social Security Numbers, and government identification records.</li>
                <li>Full student names in extracted assignment rubrics, replacing them with randomized cryptographic pseudonym tags.</li>
                <li>Institutional directory emails and personal phone records.</li>
              </ul>
              <h4 className="font-semibold text-white">2.2 Zero Data Sale &amp; Non-Commercial Educational Mandate</h4>
              <p>
                We do not sell, rent, monetize, or license student coursework, uploaded syllabi, lecture audio recordings, or grade records to any third-party data brokers or marketing networks. Coursework is processed solely to fulfill your active study requests and maintain your private workspace history.
              </p>
            </div>
          )}

          {tab === 'gdpr' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-blue-400">
                3. GDPR (EU 2016/679) &amp; Statutory Privacy Rights
              </h3>
              <p>
                For individuals residing within the European Economic Area (EEA), United Kingdom, or California (CCPA/CPRA), you are endowed with full statutory control over your personal data under Chapter III of the GDPR:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Article 15 (Right of Access):</strong> You may inspect and request an immutable structured copy of all personal profile data, study materials, and billing records.</li>
                <li><strong>Article 16 (Right to Rectification):</strong> You may correct inaccurate profile data or update your academic preferences in Settings at any time.</li>
                <li><strong>Article 17 (Right to Erasure / &quot;Right to be Forgotten&quot;):</strong> You may execute self-service account deletion via Settings &rarr; Account &rarr; Delete Account. This immediately cascades and permanently purges your user record, assignments, transcripts, payment records, and study materials from active databases.</li>
                <li><strong>Article 20 (Right to Data Portability):</strong> You may export all flashcard decks and assignment solutions in standard JSON, Anki (.apkg), or Markdown formats.</li>
                <li><strong>30-Day Backup Pruning:</strong> Encrypted automated database backups are strictly subject to a 30-day rolling expiration cycle, after which purged data is irrecoverably overwritten.</li>
              </ul>
            </div>
          )}

          {tab === 'subprocessors' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-blue-400">
                4. Third-Party AI Subprocessors &amp; Zero Training Mandate
              </h3>
              <p>
                To provide high-performance reasoning, mathematical verification, and lecture transcription, Helpotron interfaces with specialized, enterprise-grade AI cloud infrastructure:
              </p>
              <div className="overflow-x-auto border border-white/10 rounded-xl my-2">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-900 border-b border-white/10 text-slate-400">
                    <tr>
                      <th className="p-2">Subprocessor</th>
                      <th className="p-2">Purpose</th>
                      <th className="p-2">Region</th>
                      <th className="p-2">Privacy Policy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {SUBPROCESSORS.map((sp) => (
                      <tr key={sp.name} className="hover:bg-white/3">
                        <td className="p-2 font-semibold text-white">{sp.name}</td>
                        <td className="p-2 text-slate-300">{sp.purpose}</td>
                        <td className="p-2 text-slate-400">{sp.country}</td>
                        <td className="p-2">
                          <a href={sp.link} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
                            Review
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 className="font-semibold text-white">4.1 Enterprise Zero Data Retention (ZDR)</h4>
              <p>
                All student prompts, mathematical formulas, and coursework sent to OpenRouter and DeepSeek are dispatched over encrypted TLS 1.3 channels under enterprise API agreements that prohibit the use of customer data for training foundation models.
              </p>
            </div>
          )}

          {tab === 'billing' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-blue-400">
                5. Credits, Subscriptions &amp; Billing Policy
              </h3>
              <p>
                Helpotron operates on a transparent token credit economy and tiered monthly subscription model processed through Stripe.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Credit Consumption:</strong> Automated tasks (e.g. assignment solving, multi-agent study teams, audio transcription) atomically deduct credits based on exact computational effort tiers.</li>
                <li><strong>Idempotency &amp; Double-Spend Protection:</strong> All credit debits and payment webhooks are enforced with unique cryptographic idempotency keys to ensure you are never billed twice for interrupted requests.</li>
                <li><strong>Subscription Renewals:</strong> Pro and Elite subscription plans recur monthly until cancelled via the user billing portal. You retain access to your plan benefits through the conclusion of the active billing period.</li>
                <li><strong>Refund Policy:</strong> Due to immediate upstream API computing costs incurred during AI model generation, consumed credits are generally non-refundable except where required by applicable consumer protection laws.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Mandatory Agreement Checkbox & Action Buttons */}
        <div className="pt-3 border-t border-white/10 space-y-3 shrink-0">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acceptedCheckbox}
              onChange={(e) => setAcceptedCheckbox(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-white/20 bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className="text-xs text-slate-300">
              I have read, understood, and solemnly agree to the <strong>Helpotron Terms of Service</strong>, <strong>Academic Honor Code</strong>, <strong>FERPA Student Privacy Standards</strong>, and <strong>GDPR Data Processing Terms</strong>.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
            {!requireMandatoryAgreement && onDecline && (
              <button
                type="button"
                onClick={onDecline}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-semibold transition cursor-pointer"
              >
                Decline &amp; Sign Out
              </button>
            )}
            <button
              type="button"
              disabled={!acceptedCheckbox}
              onClick={() => onAccept && onAccept()}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-blue-900/40"
            >
              Accept Legal Terms &amp; Enter Workspace &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

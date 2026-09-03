import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';

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
  const [consentFromSignup, setConsentFromSignup] = useState(false);

  // WebKit replay (08-29): pointer-events must NOT ride the CSS animation clock
  // (WebKit can stall the fade for seconds+; a keyframe-carried flip could leave
  // the gate permanently non-hit-testable — observed as a 30s Accept click
  // timeout). Flip on the animation's own end event with a hard-timer fallback.
  const [peReady, setPeReady] = useState(false);
  useEffect(() => {
    if (!isOpen) { setPeReady(false); return; }
    const t = setTimeout(() => setPeReady(true), 4500);
    return () => clearTimeout(t);
  }, [isOpen]);
  const onPanelAnimEnd = (e) => {
    if (e.animationName === 'aurora-panel-in') setPeReady(true);
  };

  /* Single-consent flow (legal-gate UX fix, 08-28): the signup modal records
   * `helpotron_signup_consent` when the user agreed to the Terms/FERPA/GDPR
   * conditions there (Step 1). When this gate (Step 2) opens, that consent is
   * carried over — the checkbox arrives pre-checked so accepting is ONE click.
   * The gate itself still requires an explicit Accept click before entry;
   * nothing is accepted silently, and the compliance gate stays mandatory. */
  useEffect(() => {
    if (!isOpen) return;
    let carried = false;
    try {
      carried = localStorage.getItem('helpotron_signup_consent') === '1';
    } catch (e) { /* storage unavailable — do not pre-check */ }
    if (carried) {
      try { localStorage.removeItem('helpotron_signup_consent'); } catch (e) { /* keep going */ }
      setConsentFromSignup(true);
      setAcceptedCheckbox(true);
    }
    // No else: never re-check the box the user un-cleared while the gate was open.
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto aurora-modal-backdrop ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Privacy Policy & Terms of Service"
    >
      {/* Aurora modal chrome (scoped; index.css owns the design system).
          pointer-events is state-driven (see peReady above), never keyframe-driven.
          m-auto (not items-center) so a tall panel scrolls fully instead of top-clipping. */}
      <style>{`@keyframes aurora-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
@keyframes aurora-panel-in { from { opacity: 0; transform: translateY(12px) scale(0.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
.aurora-modal-backdrop { animation: aurora-backdrop-in 0.18s ease-out both }
.aurora-modal-panel { animation: aurora-panel-in 0.22s ease-out both }`}</style>
      <div
        className={`w-full max-w-4xl min-w-0 h-[92dvh] sm:h-auto sm:max-h-[90vh] m-auto surface-glass-strong rounded-[var(--radius-lg)] p-4 sm:p-7 flex flex-col justify-between text-[var(--text-primary)] overflow-hidden relative aurora-modal-panel ${peReady ? 'pointer-events-auto' : 'pointer-events-none'}`}
        data-modal-container
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={onPanelAnimEnd}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 shrink-0">
          <div className="min-w-0 pr-2">
            <h2 className="text-sm sm:text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 truncate">
              <span>📜</span> <span>Helpotron Legal Agreement & Privacy Policy</span>
            </h2>
            <p className="text-[11px] sm:text-xs text-[var(--text-muted)] mt-0.5 flex flex-wrap items-center gap-1.5">
              {requireMandatoryAgreement && (
                <span className="aurora-chip text-[10px] py-0.5 uppercase tracking-wider whitespace-nowrap">
                  Step 2 of 2 · Confirm consent
                </span>
              )}
              <span className="truncate">
                FERPA, GDPR Article 17, and AI Data Processing.
              </span>
            </p>
          </div>
          {!requireMandatoryAgreement && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition cursor-pointer shrink-0"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1.5 overflow-x-auto py-2.5 border-b border-[var(--border-subtle)] shrink-0 no-scrollbar">
          {[
            { id: 'terms', label: '1. Terms of Service' },
            { id: 'ferpa', label: '2. FERPA Privacy' },
            { id: 'gdpr', label: '3. GDPR Rights' },
            { id: 'subprocessors', label: '4. AI Subprocessors' },
            { id: 'billing', label: '5. Tokens & Billing' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                tab === t.id
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Legal Body */}
        <div
          className="flex-1 min-h-0 overflow-y-auto my-3 pr-1 space-y-4 text-xs text-[var(--text-secondary)] leading-relaxed border border-[var(--border-subtle)] p-3.5 sm:p-4 rounded-[var(--radius-md)] bg-[var(--bg-surface)]"
          onScroll={() => setHasScrolledTerms(true)}
        >
          {tab === 'terms' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--accent)] uppercase tracking-wider">
                1. Acceptance of Terms & Academic Integrity Standard
              </h3>
              <p>
                By creating an account, accessing, or utilizing the Helpotron platform, Chrome Extension, API endpoints, or autonomous study agents (collectively, the "Services"), you enter into a legally binding agreement with Helpotron Academic Companion Inc. ("Helpotron", "we", "our", or "us").
              </p>
              <h4 className="font-semibold text-[var(--text-primary)]">1.1 Academic Honor Code & Ethical Assistance</h4>
              <p>
                Helpotron is designed strictly as an automated supplementary academic operating system, study accelerator, and research assistant. You expressly acknowledge and warrant that:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>You will use the platform in strict accordance with your academic institution's student code of conduct, honor code, and course-specific syllabi regarding artificial intelligence tooling.</li>
                <li>You are solely responsible for verifying the factual accuracy, citations, calculations, and originality of all generated study guides, practice tests, and mathematical solutions.</li>
                <li>You shall not misrepresent autonomous agent synthesis as unassisted independent human work in violation of proctored examinations or honor examinations.</li>
              </ul>
              <h4 className="font-semibold text-[var(--text-primary)]">1.2 Account Ownership & Authentication Safeguards</h4>
              <p>
                Each student account is strictly personal and non-transferable. You agree to safeguard your authentication credentials, session cookies, and 2FA tokens. Any unauthorized activity conducted through your authenticated session is your legal responsibility. Helpotron reserves the right to immediately terminate or suspend any account engaged in credential sharing, automated scraping, or security evasion attempts.
              </p>
              <h4 className="font-semibold text-[var(--text-primary)]">1.3 Limitation of Liability & Warranty Disclaimer</h4>
              <p>
                THE SERVICES ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. HELPOTRON DOES NOT WARRANT THAT STUDY MATERIALS OR GENERATED CALCULATIONS WILL BE ERROR-FREE OR THAT THE PLATFORM WILL MEET SPECIFIC GRADE OUTCOMES. IN NO EVENT SHALL HELPOTRON BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES.
              </p>
            </div>
          )}

          {tab === 'ferpa' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--accent)] uppercase tracking-wider">
                2. FERPA & Student Educational Record Protection
              </h3>
              <p>
                Helpotron adheres to the statutory guidelines set forth by the Family Educational Rights and Privacy Act (FERPA) (34 CFR Part 99) and state educational privacy standards.
              </p>
              <h4 className="font-semibold text-[var(--text-primary)]">2.1 Client-Side De-Identification & PII Scrubbing</h4>
              <p>
                When you connect your Canvas LMS or upload coursework assignments, our automated intake filters execute deterministic redaction heuristics to strip Personally Identifiable Information (PII), including:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Student ID numbers, Social Security Numbers, and government identification records.</li>
                <li>Full student names in extracted assignment rubrics, replacing them with randomized cryptographic pseudonym tags.</li>
                <li>Institutional directory emails and personal phone records.</li>
              </ul>
              <h4 className="font-semibold text-[var(--text-primary)]">2.2 Zero Data Sale & Non-Commercial Educational Mandate</h4>
              <p>
                We do not sell, rent, monetize, or license student coursework, uploaded syllabi, lecture audio recordings, or grade records to any third-party data brokers or marketing networks. Coursework is processed solely to fulfill your active study requests and maintain your private workspace history.
              </p>
            </div>
          )}

          {tab === 'gdpr' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--accent)] uppercase tracking-wider">
                3. GDPR (EU 2016/679) & Statutory Privacy Rights
              </h3>
              <p>
                For individuals residing within the European Economic Area (EEA), United Kingdom, or California (CCPA/CPRA), you are endowed with full statutory control over your personal data under Chapter III of the GDPR:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Article 15 (Right of Access):</strong> You may inspect and request an immutable structured copy of all personal profile data, study materials, and billing records.</li>
                <li><strong>Article 16 (Right to Rectification):</strong> You may correct inaccurate profile data or update your academic preferences in Settings at any time.</li>
                <li><strong>Article 17 (Right to Erasure / "Right to be Forgotten"):</strong> You may execute self-service account deletion via Settings → Account → Delete Account. This immediately cascades and permanently purges your user record, assignments, transcripts, payment records, and study materials from active databases.</li>
                <li><strong>Article 20 (Right to Data Portability):</strong> You may export all flashcard decks and assignment solutions in standard JSON, Anki (.apkg), or Markdown formats.</li>
                <li><strong>30-Day Backup Pruning:</strong> Encrypted automated database backups are strictly subject to a 30-day rolling expiration cycle, after which purged data is irrecoverably overwritten.</li>
              </ul>
            </div>
          )}

          {tab === 'subprocessors' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--accent)] uppercase tracking-wider">
                4. Third-Party AI Subprocessors & Zero Training Mandate
              </h3>
              <p>
                To provide high-performance reasoning, mathematical verification, and lecture transcription, Helpotron interfaces with specialized, enterprise-grade AI cloud infrastructure:
              </p>
              <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl my-2">
                <table className="w-full min-w-[500px] text-left text-xs">
                  <thead className="bg-[var(--bg-surface-elevated)] border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                    <tr>
                      <th className="p-2">Subprocessor</th>
                      <th className="p-2">Purpose</th>
                      <th className="p-2">Region</th>
                      <th className="p-2">Privacy Policy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {SUBPROCESSORS.map((sp) => (
                      <tr key={sp.name} className="hover:bg-[var(--bg-surface-elevated)]">
                        <td className="p-2 font-semibold text-[var(--text-primary)]">{sp.name}</td>
                        <td className="p-2 text-[var(--text-secondary)]">{sp.purpose}</td>
                        <td className="p-2 text-[var(--text-muted)]">{sp.country}</td>
                        <td className="p-2">
                          <a href={sp.link} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline hover:text-[var(--accent-hover)]">
                            Review
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4 className="font-semibold text-[var(--text-primary)]">4.1 Enterprise Zero Data Retention (ZDR)</h4>
              <p>
                All student prompts, mathematical formulas, and coursework sent to OpenRouter and DeepSeek are dispatched over encrypted TLS 1.3 channels under enterprise API agreements that prohibit the use of customer data for training foundation models.
              </p>
            </div>
          )}

          {tab === 'billing' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--accent)] uppercase tracking-wider">
                5. Credits, Subscriptions & Billing Policy
              </h3>
              <p>
                Helpotron operates on a transparent token credit economy and tiered monthly subscription model processed through Stripe.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Credit Consumption:</strong> Automated tasks (e.g. assignment solving, multi-agent study teams, audio transcription) atomically deduct credits based on exact computational effort tiers.</li>
                <li><strong>Idempotency & Double-Spend Protection:</strong> All credit debits and payment webhooks are enforced with unique cryptographic idempotency keys to ensure you are never billed twice for interrupted requests.</li>
                <li><strong>Subscription Renewals:</strong> Pro and Elite subscription plans recur monthly until cancelled via the user billing portal. You retain access to your plan benefits through the conclusion of the active billing period.</li>
                <li><strong>Refund Policy:</strong> Due to immediate upstream API computing costs incurred during AI model generation, consumed credits are generally non-refundable except where required by applicable consumer protection laws.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Mandatory Agreement Checkbox & Action Buttons */}
        <div className="pt-3 border-t border-[var(--border-subtle)] space-y-3 shrink-0">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acceptedCheckbox}
              onChange={(e) => setAcceptedCheckbox(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded accent-[var(--accent)] cursor-pointer"
            />
            <span className="text-xs text-[var(--text-secondary)]">
              I have read, understood, and solemnly agree to the <strong>Helpotron Terms of Service</strong>, <strong>Academic Honor Code</strong>, <strong>FERPA Student Privacy Standards</strong>, and <strong>GDPR Data Processing Terms</strong>.
              {consentFromSignup && (
                <em className="not-italic flex items-center gap-1 mt-1 text-[11px] text-[var(--accent)]">
                  <Check className="w-3 h-3 shrink-0" />
                  Consent carried over from signup (Step 1) — press Accept below to enter.
                </em>
              )}
              {!acceptedCheckbox && (
                <em className="not-italic block mt-1 text-[11px] text-[var(--text-muted)]">
                  Check the box above to enable the accept button.
                </em>
              )}
            </span>
          </label>

          <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
            {!requireMandatoryAgreement && onDecline && (
              <button
                type="button"
                onClick={onDecline}
                className="w-full sm:w-auto px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-semibold transition cursor-pointer"
              >
                Decline & Sign Out
              </button>
            )}
            <button
              type="button"
              disabled={!acceptedCheckbox}
              onClick={() => onAccept && onAccept()}
              className="w-full sm:w-auto px-6 py-2.5 rounded-[var(--radius-sm)] bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold transition cursor-pointer glow-accent whitespace-nowrap"
            >
              Accept & Continue →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

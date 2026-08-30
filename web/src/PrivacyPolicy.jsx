import React from 'react';
import { Shield, Lock, FileText, CheckCircle2, Eye, Server, RefreshCw, ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8 text-[var(--text-primary)] font-sans">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Workspace
        </button>
      )}

      {/* Header */}
      <div className="border-b border-[var(--border-subtle)] pb-6 space-y-2">
        <div className="flex items-center gap-2 text-[var(--accent)] text-xs font-mono font-bold uppercase tracking-wider">
          <Shield className="w-4 h-4" /> Institutional Data Governance &amp; Statutory Disclosure
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">Helpotron Privacy Policy &amp; Student Data Protection</h2>
        <p className="text-xs sm:text-sm text-[var(--text-muted)]">
          Last Updated: August 25, 2026 &bull; Compliant with FERPA (34 CFR Part 99), GDPR (EU 2016/679), CCPA/CPRA, and Enterprise Zero-Data-Retention (ZDR) Standards.
        </p>
      </div>

      {/* Section 1: Academic Integrity & Honor Code */}
      <div className="space-y-3 glass-panel p-6">
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <FileText className="w-5 h-5 text-[var(--accent)]" /> 1. Academic Integrity &amp; Student Responsibility
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Helpotron is designed as an autonomous supplementary study platform, research synthesizer, and personal educational operating system. By utilizing the platform, you agree to uphold your institution&apos;s academic honor code, course-specific syllabi rules, and ethical AI utilization policies. Helpotron strictly prohibits utilizing autonomous reasoning outputs for direct submission during proctored examinations or unauthorized assessments.
        </p>
      </div>

      {/* Section 2: FERPA Compliance */}
      <div className="space-y-3 glass-panel p-6">
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-400" /> 2. FERPA (Family Educational Rights and Privacy Act) Compliance
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Under FERPA statutory mandates (34 CFR Part 99), student educational records are strictly protected. Helpotron applies the following technical controls:
        </p>
        <ul className="list-disc pl-5 text-xs text-[var(--text-secondary)] space-y-1.5 leading-relaxed">
          <li><strong>Deterministic PII Scrubbing:</strong> Extracted Canvas coursework, student IDs, email headers, and instructor names are sanitized and pseudonymized prior to processing.</li>
          <li><strong>Zero Data Brokerage:</strong> We do not sell, rent, monetize, or disclose student records or study materials to advertisers or data aggregators.</li>
          <li><strong>Encrypted Transport:</strong> All API payloads, transcripts, and study notes are transmitted exclusively via TLS 1.3 encryption with strict HSTS preloading.</li>
        </ul>
      </div>

      {/* Section 3: GDPR & Statutory Rights */}
      <div className="space-y-3 glass-panel p-6">
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-indigo-400" /> 3. GDPR (EU 2016/679) &amp; CCPA/CPRA Consumer Rights
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          You maintain full statutory rights over your personal data:
        </p>
        <ul className="list-disc pl-5 text-xs text-[var(--text-secondary)] space-y-1.5 leading-relaxed">
          <li><strong>Article 17 (Right to Erasure / &quot;Right to be Forgotten&quot;):</strong> Self-service one-click account deletion triggers immediate cascading removal of all user tables, assignments, payment histories, and study transcripts.</li>
          <li><strong>Article 15 &amp; 20 (Access &amp; Portability):</strong> Export your study sets, flashcards, and notes at any time in structured JSON, Anki (.apkg), or Markdown.</li>
          <li><strong>30-Day Automated Backup Purge:</strong> Encrypted system database backups are automatically rotated and pruned on a strict 30-day lifecycle.</li>
        </ul>
      </div>

      {/* Section 4: AI Model Subprocessors */}
      <div className="space-y-3 glass-panel p-6">
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Server className="w-5 h-5 text-purple-400" /> 4. AI Subprocessors &amp; Zero Training Mandate
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Coursework synthesis and model routing are processed through audited enterprise cloud partners:
        </p>
        <div className="overflow-x-auto border border-[var(--border-subtle)] rounded-xl my-2">
          <table className="w-full min-w-[500px] text-left text-xs">
            <thead className="bg-[var(--bg-surface-elevated)] text-[var(--text-muted)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="p-2.5">Provider</th>
                <th className="p-2.5">Service</th>
                <th className="p-2.5">Region</th>
                <th className="p-2.5">Zero Training Guarantee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              <tr className="hover:bg-[var(--bg-surface-elevated)]">
                <td className="p-2.5 font-semibold text-[var(--text-primary)]">OpenRouter, Inc.</td>
                <td className="p-2.5 text-[var(--text-secondary)]">LLM Gateway &amp; Inference Dispatch</td>
                <td className="p-2.5 text-[var(--text-muted)]">United States</td>
                <td className="p-2.5 text-emerald-400 font-semibold">Enforced (ZDR Agreement)</td>
              </tr>
              <tr className="hover:bg-[var(--bg-surface-elevated)]">
                <td className="p-2.5 font-semibold text-[var(--text-primary)]">DeepSeek AI</td>
                <td className="p-2.5 text-[var(--text-secondary)]">Reasoning &amp; Python Math Execution</td>
                <td className="p-2.5 text-[var(--text-muted)]">US Gateway</td>
                <td className="p-2.5 text-emerald-400 font-semibold">Enforced (API Terms)</td>
              </tr>
              <tr className="hover:bg-[var(--bg-surface-elevated)]">
                <td className="p-2.5 font-semibold text-[var(--text-primary)]">Google Cloud</td>
                <td className="p-2.5 text-[var(--text-secondary)]">Audio Transcription &amp; Multimodal Vision</td>
                <td className="p-2.5 text-[var(--text-muted)]">United States</td>
                <td className="p-2.5 text-emerald-400 font-semibold">Enforced (Enterprise Cloud)</td>
              </tr>
              <tr className="hover:bg-[var(--bg-surface-elevated)]">
                <td className="p-2.5 font-semibold text-[var(--text-primary)]">Stripe, Inc.</td>
                <td className="p-2.5 text-[var(--text-secondary)]">Payment Gateway &amp; Subscription Billing</td>
                <td className="p-2.5 text-[var(--text-muted)]">United States</td>
                <td className="p-2.5 text-emerald-400 font-semibold">PCI-DSS Level 1</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          *Under our enterprise API agreements, your inputs and study documents are never utilized to train, retrain, or improve foundational AI models.
        </p>
      </div>

      {/* Section 5: Credits & Billing */}
      <div className="space-y-3 glass-panel p-6">
        <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-amber-400" /> 5. Billing, Credits &amp; Refund Policy
        </h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Helpotron utilizes an atomic credit economy with row-level transaction verification and idempotency keys to eliminate double-spending. Subscriptions auto-renew monthly and can be cancelled at any time through the Billing portal. Consumed credits represent direct upstream compute costs and are non-refundable once compute operations complete.
        </p>
      </div>
    </div>
  );
}

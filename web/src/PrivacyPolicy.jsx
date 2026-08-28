import React from 'react';
import { Shield, Lock, FileText, CheckCircle2, Eye, Server, RefreshCw, ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 space-y-8 text-slate-100 font-sans">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Workspace
        </button>
      )}

      {/* Header */}
      <div className="border-b border-white/10 pb-6 space-y-2">
        <div className="flex items-center gap-2 text-blue-400 text-xs font-mono font-bold uppercase tracking-wider">
          <Shield className="w-4 h-4" /> Institutional Data Governance &amp; Statutory Disclosure
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-white">Helpotron Privacy Policy &amp; Student Data Protection</h2>
        <p className="text-xs sm:text-sm text-slate-400">
          Last Updated: August 25, 2026 &bull; Compliant with FERPA (34 CFR Part 99), GDPR (EU 2016/679), CCPA/CPRA, and Enterprise Zero-Data-Retention (ZDR) Standards.
        </p>
      </div>

      {/* Section 1: Academic Integrity & Honor Code */}
      <div className="space-y-3 bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" /> 1. Academic Integrity &amp; Student Responsibility
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Helpotron is designed as an autonomous supplementary study platform, research synthesizer, and personal educational operating system. By utilizing the platform, you agree to uphold your institution&apos;s academic honor code, course-specific syllabi rules, and ethical AI utilization policies. Helpotron strictly prohibits utilizing autonomous reasoning outputs for direct submission during proctored examinations or unauthorized assessments.
        </p>
      </div>

      {/* Section 2: FERPA Compliance */}
      <div className="space-y-3 bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-emerald-400" /> 2. FERPA (Family Educational Rights and Privacy Act) Compliance
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Under FERPA statutory mandates (34 CFR Part 99), student educational records are strictly protected. Helpotron applies the following technical controls:
        </p>
        <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1.5 leading-relaxed">
          <li><strong>Deterministic PII Scrubbing:</strong> Extracted Canvas coursework, student IDs, email headers, and instructor names are sanitized and pseudonymized prior to processing.</li>
          <li><strong>Zero Data Brokerage:</strong> We do not sell, rent, monetize, or disclose student records or study materials to advertisers or data aggregators.</li>
          <li><strong>Encrypted Transport:</strong> All API payloads, transcripts, and study notes are transmitted exclusively via TLS 1.3 encryption with strict HSTS preloading.</li>
        </ul>
      </div>

      {/* Section 3: GDPR & Statutory Rights */}
      <div className="space-y-3 bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-indigo-400" /> 3. GDPR (EU 2016/679) &amp; CCPA/CPRA Consumer Rights
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          You maintain full statutory rights over your personal data:
        </p>
        <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1.5 leading-relaxed">
          <li><strong>Article 17 (Right to Erasure / &quot;Right to be Forgotten&quot;):</strong> Self-service one-click account deletion triggers immediate cascading removal of all user tables, assignments, payment histories, and study transcripts.</li>
          <li><strong>Article 15 &amp; 20 (Access &amp; Portability):</strong> Export your study sets, flashcards, and notes at any time in structured JSON, Anki (.apkg), or Markdown.</li>
          <li><strong>30-Day Automated Backup Purge:</strong> Encrypted system database backups are automatically rotated and pruned on a strict 30-day lifecycle.</li>
        </ul>
      </div>

      {/* Section 4: AI Model Subprocessors */}
      <div className="space-y-3 bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Server className="w-5 h-5 text-purple-400" /> 4. AI Subprocessors &amp; Zero Training Mandate
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Coursework synthesis and model routing are processed through audited enterprise cloud partners:
        </p>
        <div className="overflow-x-auto border border-white/10 rounded-xl my-2">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-white/10">
              <tr>
                <th className="p-2.5">Provider</th>
                <th className="p-2.5">Service</th>
                <th className="p-2.5">Region</th>
                <th className="p-2.5">Zero Training Guarantee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <tr>
                <td className="p-2.5 font-semibold text-white">OpenRouter, Inc.</td>
                <td className="p-2.5 text-slate-300">LLM Gateway &amp; Inference Dispatch</td>
                <td className="p-2.5 text-slate-400">United States</td>
                <td className="p-2.5 text-emerald-400 font-semibold">Enforced (ZDR Agreement)</td>
              </tr>
              <tr>
                <td className="p-2.5 font-semibold text-white">DeepSeek AI</td>
                <td className="p-2.5 text-slate-300">Reasoning &amp; Python Math Execution</td>
                <td className="p-2.5 text-slate-400">US Gateway</td>
                <td className="p-2.5 text-emerald-400 font-semibold">Enforced (API Terms)</td>
              </tr>
              <tr>
                <td className="p-2.5 font-semibold text-white">Google Cloud</td>
                <td className="p-2.5 text-slate-300">Audio Transcription &amp; Multimodal Vision</td>
                <td className="p-2.5 text-slate-400">United States</td>
                <td className="p-2.5 text-emerald-400 font-semibold">Enforced (Enterprise Cloud)</td>
              </tr>
              <tr>
                <td className="p-2.5 font-semibold text-white">Stripe, Inc.</td>
                <td className="p-2.5 text-slate-300">Payment Gateway &amp; Subscription Billing</td>
                <td className="p-2.5 text-slate-400">United States</td>
                <td className="p-2.5 text-emerald-400 font-semibold">PCI-DSS Level 1</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400">
          *Under our enterprise API agreements, your inputs and study documents are never utilized to train, retrain, or improve foundational AI models.
        </p>
      </div>

      {/* Section 5: Credits & Billing */}
      <div className="space-y-3 bg-slate-900/60 border border-white/10 rounded-2xl p-6">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-amber-400" /> 5. Billing, Credits &amp; Refund Policy
        </h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Helpotron utilizes an atomic credit economy with row-level transaction verification and idempotency keys to eliminate double-spending. Subscriptions auto-renew monthly and can be cancelled at any time through the Billing portal. Consumed credits represent direct upstream compute costs and are non-refundable once compute operations complete.
        </p>
      </div>
    </div>
  );
}

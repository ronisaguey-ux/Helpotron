import React, { useState } from 'react';

export default function PrivacyPolicyModal({ isOpen, onAccept, onDecline }) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [confirmedCheckbox, setConfirmedCheckbox] = useState(false);

  if (!isOpen) return null;

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (scrollTop + clientHeight >= scrollHeight - 40) {
      setHasScrolledToBottom(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-md">
              📜
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Helpotron Comprehensive Privacy Policy & Terms of Service
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Last Revised: August 2026 • Version 4.2.0-Enterprise • Applicable to All Users & Autonomous Sub-Agents
              </p>
            </div>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200">
            Mandatory Agreement
          </span>
        </div>

        {/* Scrollable Comprehensive Legal Terms */}
        <div
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pr-2 text-xs text-slate-700 space-y-5 leading-relaxed border border-slate-200 bg-slate-50/70 p-5 rounded-2xl"
        >
          {/* SECTION 1 */}
          <section className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>§ 1.</span> Preamble & Binding Contractual Framework
            </h3>
            <p>
              By accessing, browsing, interacting with, or authenticating through the Helpotron Academic Orchestration Platform (hereinafter referred to as "Helpotron", "the Platform", "we", "our", or "the System"), you ("User", "Licensee", "Student", or "Authorized Guest") enter into an absolute and legally binding agreement governed by these Terms of Service and Privacy Governance Charter. If you do not agree unconditionally to every stipulation detailed herein, you are strictly required to click "Decline" and restrict your session to Guest (Read-Only) inspection.
            </p>
          </section>

          {/* SECTION 2 */}
          <section className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>§ 2.</span> Academic Integrity, Ethics, & Institutional Honor Codes
            </h3>
            <p>
              Helpotron operates exclusively as an advanced personal cognitive prosthesis, educational drafting assistant, rubric decomposition parser, citation generator, and study workflow automator. The System is explicitly engineered to assist students in understanding complex syllabi, structuring conceptual arguments, synthesizing lecture transcripts into flashcards, and refining written prose.
            </p>
            <p>
              <strong>2.1 User Responsibility & Institutional Compliance:</strong> You acknowledge that you bear 100% individual liability for ensuring that your utilization of machine-assisted drafting, automated humanization filters, and synthetic rubric alignment strictly complies with your specific educational institution’s Academic Honor Code, Departmental Syllabus policies, and Faculty Guidelines.
            </p>
            <p>
              <strong>2.2 Anti-Plagiarism & Verification:</strong> Helpotron provides automated multi-engine originality scanning (including cross-referencing Turnitin-style vector embeddings, CopyLeaks lexical signatures, and GPTZero perplexity scoring). These tools are advisory diagnostics; the System makes no absolute warranty against disciplinary actions initiated by third-party academic bodies.
            </p>
          </section>

          {/* SECTION 3 */}
          <section className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>§ 3.</span> Student Data Sovereignty, FERPA Alignment, & Absolute Zero Data-Sale Guarantee
            </h3>
            <p>
              <strong>3.1 Absolute Ownership of User Content:</strong> You retain complete, unencumbered, and exclusive intellectual property rights to all assignment prompts, uploaded syllabi, lecture audio recordings, study notes, rubric documents, and synthesized drafts submitted to or generated by Helpotron.
            </p>
            <p>
              <strong>3.2 Zero Unauthorized Data Monetization:</strong> Under no circumstances does Helpotron sell, broker, rent, lease, or monetize your raw user prompts, personal identifying information (PII), academic transcripts, or generated essays to third-party data aggregators, advertising networks, or institutional surveillance vendors.
            </p>
            <p>
              <strong>3.3 Voluntary Data Lake & Research Discount Pool:</strong> In accordance with our transparent incentive structure, users may voluntarily opt into our anonymized Academic Data Lake to receive automated platform credit discounts (up to 40% off compute credits). Data enrolled in this pool is cryptographically stripped of all personal names, institutional course numbers, student ID identifiers, and server IP addresses prior to being utilized for local perplexity model benchmarking.
            </p>
          </section>

          {/* SECTION 4 */}
          <section className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>§ 4.</span> Multi-Engine AI Architecture & Sub-Agent Orchestration Liability
            </h3>
            <p>
              Helpotron deploys autonomous multi-agent pipelines (incorporating the Overlord Main Agent and specialized Sub-Agents for Research, Rubric Decomposition, Humanization, Citation Synthesis, and Draft Generation).
            </p>
            <p>
              <strong>4.1 Operation Modes & User Consent:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li>
                <strong>Manual Mode:</strong> Every single sub-agent action, web search query, file export, and text mutation requires explicit human confirmation via an interactive permission modal.
              </li>
              <li>
                <strong>Auto Mode:</strong> Safe, non-destructive actions (such as reading rubrics, creating citations, and generating study notes) execute autonomously, while state-altering or credit-consuming actions trigger permission requests.
              </li>
              <li>
                <strong>YOLO Mode:</strong> All sub-agents execute continuously without interrupting the user. By activating YOLO Mode, you expressly acknowledge and accept full responsibility for all autonomous agent decisions, credit expenditures, and draft outputs without prior preview.
              </li>
            </ul>
          </section>

          {/* SECTION 5 */}
          <section className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>§ 5.</span> Cryptographic Security, Session Encryption, & GDPR/CCPA Rights
            </h3>
            <p>
              <strong>5.1 In-Transit & At-Rest Encryption:</strong> All communications between your client browser and the Helpotron backend are encrypted via TLS 1.3 with AES-256-GCM cipher suites. All persisted session state, 2FA credentials, and database records are safeguarded by cryptographic salting and hashing.
            </p>
            <p>
              <strong>5.2 Right to Erasure & Export (GDPR Article 17):</strong> Users possess the unalienable right to request instant, permanent deletion of their account records, transcripts, and assignment cards via the User Preferences modal. Furthermore, one-click JSON data export is provided to guarantee complete data portability.
            </p>
          </section>

          {/* SECTION 6 */}
          <section className="space-y-2">
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <span>§ 6.</span> Guest (Read-Only) Inspection & Limitation of Remedies
            </h3>
            <p>
              Users who decline these Terms of Service are granted non-exclusive, revocable, read-only Guest access to inspect sample courses, UI dashboards, and simulation workflows. In Guest mode, all compute dispatch, automated generation, and data-modifying API endpoints are disabled.
            </p>
            <p>
              <strong>6.1 Limitation of Liability:</strong> To the maximum extent permitted by applicable law, Helpotron and its contributors shall not be liable for any direct, indirect, incidental, punitive, or consequential damages resulting from academic sanctions, lost grades, service interruptions, or computational errors.
            </p>
          </section>

          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 font-medium">
            ℹ️ Please scroll to the bottom of this agreement and check the confirmation box below to unlock the full Helpotron application.
          </div>
        </div>

        {/* Modal Footer & Actions */}
        <div className="pt-4 space-y-3 border-t border-slate-100 mt-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-800 select-none">
            <input
              type="checkbox"
              checked={confirmedCheckbox}
              onChange={(e) => setConfirmedCheckbox(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <span>
              I have read, understood, and unconditionally agree to the Helpotron Academic Privacy Policy & Terms of Service.
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <button
              onClick={onAccept}
              disabled={!confirmedCheckbox}
              className="py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
            >
              ✅ Agree & Unlock Full Access
            </button>

            <button
              onClick={onDecline}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
            >
              ❌ Decline (Explore as Guest / Read-Only)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

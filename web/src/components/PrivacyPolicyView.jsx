import React from 'react';
import { ShieldCheck, Lock, FileText, CheckCircle2, Download, AlertTriangle, Eye, Sparkles } from 'lucide-react';

export default function PrivacyPolicyView() {
  const handleExportData = () => {
    try {
      const exportData = {
        app: 'Helpotron Academic Workspace',
        timestamp: new Date().toISOString(),
        user_preferences: JSON.parse(localStorage.getItem('helpotron_user_settings') || '{}'),
        datalake_submissions: JSON.parse(localStorage.getItem('helpotron_datalake_submissions') || '[]'),
        privacy_status: 'Accepted (GDPR/FERPA Compliant)',
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `helpotron_privacy_data_export_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Export error:', e);
    }
  };

  return (
    <div className="space-y-6 text-slate-100 max-w-5xl mx-auto animate-fadeIn">
      {/* Header Banner */}
      <div className="clean-card rounded-3xl p-6 bg-slate-950/80 border border-emerald-500/30 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-2xl font-bold shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] font-semibold mb-1">
              FERPA & GDPR Compliant • Version 4.2.0
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Privacy Policy & Student Data Charter</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive legal terms governing data sovereignty, multi-agent AI execution, and zero data monetization.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportData}
          className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Export Privacy Data (JSON)</span>
        </button>
      </div>

      {/* Main Legal Content Sections */}
      <div className="clean-card rounded-3xl p-6 sm:p-8 bg-slate-950/60 border border-white/10 space-y-6 text-xs text-slate-300 leading-relaxed">
        
        {/* Section 1 */}
        <section className="space-y-2 border-b border-white/5 pb-6">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400 font-mono">§ 1.</span> Preamble & Binding Contractual Framework
          </h2>
          <p>
            By accessing, browsing, interacting with, or authenticating through the Helpotron Academic Orchestration Platform (hereinafter referred to as "Helpotron", "the Platform", "we", "our", or "the System"), you enter into an absolute and legally binding agreement governed by these Terms of Service and Privacy Governance Charter.
          </p>
          <p>
            Helpotron is strictly engineered as a cognitive study prosthesis, active recall generator, rubric decomposition engine, and citation assistant for students.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-2 border-b border-white/5 pb-6">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400 font-mono">§ 2.</span> Academic Integrity & Institutional Ethics
          </h2>
          <p>
            <strong>2.1 User Responsibility:</strong> You acknowledge and agree that you bear 100% individual responsibility for ensuring that your utilization of machine-assisted drafting, automated humanization filters, and synthetic rubric alignment strictly complies with your specific educational institution’s Academic Honor Code, Departmental Syllabus policies, and Faculty Guidelines.
          </p>
          <p>
            <strong>2.2 Advisory Diagnostic Originality Scans:</strong> Helpotron provides automated originality scanning and perplexity scoring. These metrics are advisory diagnostics; the System makes no absolute warranty against disciplinary actions initiated by third-party academic bodies.
          </p>
        </section>

        {/* Section 3 */}
        <section className="space-y-2 border-b border-white/5 pb-6">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400 font-mono">§ 3.</span> Student Data Sovereignty & Zero Data-Sale Guarantee
          </h2>
          <p>
            <strong>3.1 Absolute Ownership of User Content:</strong> You retain complete, unencumbered, and exclusive intellectual property rights to all assignment prompts, uploaded syllabi, lecture audio recordings, study notes, rubric documents, and synthesized drafts submitted to or generated by Helpotron.
          </p>
          <p>
            <strong>3.2 Zero Unauthorized Data Monetization:</strong> Under no circumstances does Helpotron sell, broker, rent, lease, or monetize your raw user prompts, personal identifying information (PII), academic transcripts, or generated essays to third-party data aggregators, advertising networks, or institutional surveillance vendors.
          </p>
          <p>
            <strong>3.3 Voluntary Data Lake Incentive Pool:</strong> Users may voluntarily opt into our anonymized Academic Data Lake to earn micro-credits and compute discounts. Data enrolled in this pool is cryptographically stripped of all personal names, institutional course numbers, student ID identifiers, and server IP addresses prior to synthesis. Micro-credits from Data Lake entries are credited once verified and utilized (processing may take 2+ business days).
          </p>
        </section>

        {/* Section 4 */}
        <section className="space-y-2 border-b border-white/5 pb-6">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400 font-mono">§ 4.</span> Multi-Agent Overlord Architecture & Operation Modes
          </h2>
          <p>
            Helpotron deploys autonomous multi-agent pipelines governed by user-controlled permission engines:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-white/5 space-y-1">
              <span className="font-bold text-blue-300 block">Manual Mode</span>
              <p className="text-[11px] text-slate-400">Every sub-agent action, file export, and text mutation requires explicit human confirmation.</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-white/5 space-y-1">
              <span className="font-bold text-purple-300 block">Auto Mode</span>
              <p className="text-[11px] text-slate-400">Safe, non-destructive read operations execute autonomously; state changes trigger prompts.</p>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-white/5 space-y-1">
              <span className="font-bold text-amber-300 block">YOLO Mode</span>
              <p className="text-[11px] text-slate-400">Agents execute continuously without interruption. Full responsibility is accepted by user.</p>
            </div>
          </div>
        </section>

        {/* Section 5 */}
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <span className="text-emerald-400 font-mono">§ 5.</span> Cryptographic Encryption & GDPR Right to Erasure
          </h2>
          <p>
            <strong>5.1 In-Transit & At-Rest Encryption:</strong> All communications between your client browser and the Helpotron backend are encrypted via TLS 1.3 with AES-256-GCM cipher suites. All persisted session state, 2FA credentials, and database records are safeguarded by cryptographic salting and hashing.
          </p>
          <p>
            <strong>5.2 Right to Erasure (GDPR Article 17):</strong> Users possess the unalienable right to request permanent, non-recoverable deletion of all account records, transcripts, and assignment cards via the Settings menu or through a direct request to Admin.
          </p>
        </section>

      </div>
    </div>
  );
}

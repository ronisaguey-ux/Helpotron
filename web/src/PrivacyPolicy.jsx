import React, { useState } from 'react';
import { Shield, Lock, FileText, CheckCircle2, ArrowLeft, Download, Scale, Cpu, Globe, Database, Key } from 'lucide-react';

export default function PrivacyPolicy({ onAgree, onClose }) {
  const [agreed, setAgreed] = useState(false);

  const handleAgree = () => {
    if (agreed) {
      if (onAgree) onAgree();
      localStorage.setItem('helpotron_privacy_agreed', 'true');
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-300 font-sans leading-relaxed selection:bg-blue-600 selection:text-white pb-24">
      {/* Sticky Header Bar */}
      <div className="sticky top-0 z-30 bg-[#090d16]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Helpotron Platform Legal & Privacy Architecture</h1>
            <p className="text-[11px] text-slate-400">Global Data Processing Agreement (DPA) & Privacy Specification</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Workspace</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-12">
        {/* Document Metadata Hero */}
        <div className="border border-white/10 rounded-2xl p-8 bg-gradient-to-br from-slate-900/60 via-[#0f172a]/40 to-slate-950/80 backdrop-blur-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-mono mb-4">
            <Shield className="w-3.5 h-3.5" />
            <span>LEGAL-SPEC-v2026.2.4 · ENTERPRISE COMPLIANCE</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Comprehensive Privacy Policy, Data Processing Agreement, & Model Execution Terms
          </h1>
          <p className="text-sm text-slate-400 mt-4 leading-relaxed max-w-4xl">
            This authoritative legal charter sets forth the rights, obligations, ingestion protocols, cryptographic lifecycle schedules, and cross-tenant boundary protections governing all data subjects, clients, institutional operators, and automated sub-agents interfacing with the Helpotron Automator platform and associated client applications.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10 text-xs">
            <div>
              <span className="text-slate-500 block">Effective Date</span>
              <span className="text-slate-200 font-mono font-medium">August 18, 2026</span>
            </div>
            <div>
              <span className="text-slate-500 block">Governance Framework</span>
              <span className="text-slate-200 font-mono font-medium">GDPR, FERPA, CCPA/CPRA</span>
            </div>
            <div>
              <span className="text-slate-500 block">Inference Standard</span>
              <span className="text-slate-200 font-mono font-medium">Zero-Data Retention (ZDR)</span>
            </div>
            <div>
              <span className="text-slate-500 block">Security Classification</span>
              <span className="text-slate-200 font-mono font-medium">SOC-2 Type II Aligned</span>
            </div>
          </div>
        </div>

        {/* SECTION 1: PREAMBLE & STATUTORY GOVERNANCE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Globe className="w-4 h-4" />
            <span>Section 1.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">1. Statutory Governance, Declarations, & Regulatory Alignment</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              Helpotron Automator Technologies, LLC ("Helpotron", "Platform", "We", "Us", or "Our") provides an enterprise-grade, privacy-first academic automation infrastructure, including browser extensions, headless synchronization daemons, artificial intelligence orchestration microservices, and active recall optimization tools. This Privacy Policy and Data Processing Agreement ("Agreement") constitutes a binding legal compact between you ("User", "Data Subject", "You", or "Institutional Operator") and Helpotron.
            </p>
            <p>
              Our software architecture is intentionally structured to comply with international statutory frameworks including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-slate-300 text-xs sm:text-sm">
              <li><strong>General Data Protection Regulation (EU GDPR 2016/679)</strong> and the United Kingdom GDPR / Data Protection Act 2018.</li>
              <li><strong>California Consumer Privacy Act of 2018 (CCPA)</strong> as amended by the <strong>California Privacy Rights Act of 2020 (CPRA)</strong>.</li>
              <li><strong>Family Educational Rights and Privacy Act (FERPA - 20 U.S.C. § 1232g; 34 CFR Part 99)</strong> regarding the privacy of student educational records.</li>
              <li><strong>Children's Online Privacy Protection Act (COPPA - 15 U.S.C. §§ 6501–6508)</strong>.</li>
              <li><strong>ISO/IEC 27001:2022</strong> Information Security Management and <strong>SOC 2 Type II</strong> trust principles for Security, Availability, and Confidentiality.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 2: TAXONOMY & DEFINITIONS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Database className="w-4 h-4" />
            <span>Section 2.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">2. Definitional Taxonomy & Data Classification Framework</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              To maintain absolute transparency and prevent jurisdictional ambiguity, the following terms are rigorously defined:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-1.5">
                <span className="text-xs font-semibold text-blue-300 block">Personal Identifiable Information (PII)</span>
                <p className="text-xs text-slate-400">
                  Data identifiers including public IDs, email hashes, cryptographic session cookies, IP hashes, and Telegram communication tokens.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-1.5">
                <span className="text-xs font-semibold text-blue-300 block">Academic Ingestion Artifacts</span>
                <p className="text-xs text-slate-400">
                  Assignment titles, course syllabi, rubric requirements, submitted drafts, teacher grading notes, and Canvas LMS DOM structural snapshots.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-1.5">
                <span className="text-xs font-semibold text-blue-300 block">Acoustic & Semantic Transcripts</span>
                <p className="text-xs text-slate-400">
                  Ephemerally buffered audio files from classroom lectures converted via Whisper neural models into text strings with raw audio discarded immediately.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-1.5">
                <span className="text-xs font-semibold text-blue-300 block">Stylistic Persona Vectors</span>
                <p className="text-xs text-slate-400">
                  Statistical metrics representing vocabulary variance, sentence length distributions, burstiness indexes, and tone preferences stored in isolated tenant parameters.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 3: INGESTION VECTORS & BROWSER EXTENSIONS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Cpu className="w-4 h-4" />
            <span>Section 3.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">3. Ingestion Vectors, LMS Integrations, & Browser Extension Scopes</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              The Helpotron Automator Chrome / Chromium Extension operates strictly within deterministic manifest permission boundaries. The table below delineates the precise technical scope of each declared extension permission:
            </p>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-200 border-b border-white/10 font-mono">
                  <tr>
                    <th className="p-3">Permission Scope</th>
                    <th className="p-3">Ingestion Boundary</th>
                    <th className="p-3">Purpose & Security Protocol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-400">
                  <tr>
                    <td className="p-3 font-mono text-blue-300">activeTab</td>
                    <td className="p-3">Current Canvas / LMS Document Window</td>
                    <td className="p-3">Extracts assignment prompt, rubric criteria, and due date when user clicks sync. Does not log browsing history.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-blue-300">storage / cookies</td>
                    <td className="p-3">Local Extension Storage Partition</td>
                    <td className="p-3">Stores encrypted CSRF tokens, session keys, and offline flashcard review queues. Zero sync to third-party ad networks.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-blue-300">scripting</td>
                    <td className="p-3">LMS Form Fields & Submission DOM</td>
                    <td className="p-3">Assists in formatting pasted drafts, checking bibliography references, and rendering real-time active recall study aids.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-mono text-blue-300">declarativeNetRequest</td>
                    <td className="p-3">Local API Endpoints (localhost:8000)</td>
                    <td className="p-3">Routes local background tasks safely to your verified Helpotron server instance without leaking credentials.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* SECTION 4: ZERO-DATA RETENTION & LLM INFERENCE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>Section 4.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">4. Zero-Data Retention (ZDR) & LLM Model Execution SLA</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              When utilizing Helpotron's automated synthesis, rubric analysis, quiz generation, or style calibration pipelines, data payloads are transmitted to secure inference endpoints (including DeepSeek V4 Flash and OpenAI enterprise nodes). We enforce a strict contractual <strong>Zero-Data Retention (ZDR)</strong> standard:
            </p>
            <div className="p-5 rounded-2xl bg-blue-950/20 border border-blue-500/20 space-y-3 text-xs sm:text-sm text-slate-300">
              <div className="flex items-center gap-2 text-blue-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Zero Model Retraining & Multi-Tenant Isolation Guarantee</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your submitted text prompts, classroom rubrics, lecture notes, audio files, and generated study materials are <strong>NEVER</strong> used to train, tune, validate, or iterate on any foundational language models, generative weights, or public neural networks.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                All inference requests are executed in stateless virtual containers. Payloads are processed in transient RAM buffers and purged immediately upon response streaming completion.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 5: MULTI-AGENT VIRTUALIZATION & SANDBOXING */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Key className="w-4 h-4" />
            <span>Section 5.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">5. Multi-Agent Orchestration & Hypervisor Sandboxing Controls</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              Helpotron employs an autonomous multi-agent task dispatch system (the Overlord Agent Architecture). To safeguard client workstations and preserve data perimeter integrity:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-xs sm:text-sm text-slate-400">
              <li><strong>Ephemeral Hypervisor Sandboxing:</strong> All background scrapers, code evaluators, and rubric parsing sub-agents execute inside isolated unprivileged sandbox runtimes.</li>
              <li><strong>Interactive Human-in-the-Loop Permissions:</strong> Actions involving filesystem writing, network dispatch, or assignment submission trigger immediate user authorization modals with strict rejection and replacement overrides.</li>
              <li><strong>Auto-Approval Whitelist Controls:</strong> Users retain granular control over which autonomous tasks (e.g. humanize drafts, extract rubrics) can execute without explicit confirmation prompts.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 6: FERPA & EDUCATIONAL PRIVACY COMPLIANCE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>Section 6.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">6. FERPA Compliance & Educational Institutional Protections</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              Under the <strong>Family Educational Rights and Privacy Act (FERPA)</strong>, student educational records are subject to stringent privacy protections. Helpotron operates as a student-directed personal study workstation and adheres to the following FERPA compliance protocols:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-2">
                <span className="text-xs font-semibold text-white block">Student Sole Ownership</span>
                <p className="text-xs text-slate-400">
                  The individual student retains exclusive copyright and operational control over all synced coursework, outlines, and notes. No institutional data is shared without affirmative direction.
                </p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-2">
                <span className="text-xs font-semibold text-white block">Local Data Partitioning</span>
                <p className="text-xs text-slate-400">
                  Course assignments and syllabus documents are isolated by tenant identifier (`public_id`). SQLite storage partitions are protected with WAL mode and unguessable primary keys.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: CRYPTOGRAPHIC PURGING & RIGHT TO ERASURE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Shield className="w-4 h-4" />
            <span>Section 7.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">7. Cryptographic Shredding, Data Retention Schedules, & Right to Erasure</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              In accordance with <strong>GDPR Article 17 ("Right to be Forgotten")</strong> and CCPA/CPRA deletion mandates, you possess the unqualified right to purge all data footprints associated with your account at any moment:
            </p>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 space-y-2 text-xs text-slate-300">
              <span className="font-semibold text-slate-200 block">Immediate Hard-Purge Lifecycle:</span>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                <li><strong>One-Click Cache Format:</strong> Invoking "Format Temp Cache Directories" in the administrative console immediately overwrites transient audio chunks, transcript scratchpads, and vector caches.</li>
                <li><strong>Account Deletion Cascade:</strong> Deleting an account initiates a synchronous transactional cascade across the `User`, `Assignment`, `StudyMaterial`, `Transcript`, and `CreditTransaction` tables.</li>
                <li><strong>Local Storage Reset:</strong> The frontend application provides a single-click "Reset App Cache & Reload" button that clears all indexed keys, cookies, and tokens from your browser.</li>
              </ol>
            </div>
          </div>
        </section>

        {/* SECTION 8: DATA SECURITY, RATE LIMITING & AUDIT LOGS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4" />
            <span>Section 8.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">8. Enterprise Security Posture, CSRF Shielding, & Threat Mitigation</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              Helpotron enforces multi-layered defensive countermeasures across all communication interfaces:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-xs sm:text-sm text-slate-400">
              <li><strong>Transport Encryption:</strong> All communications leverage TLS 1.3 encryption with strict HSTS headers and secure cookie flags.</li>
              <li><strong>CSRF & Double-Submit Protection:</strong> All mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`) require matching cryptographic `X-CSRF-Token` headers.</li>
              <li><strong>Adaptive Rate Limiting:</strong> In-memory token-bucket limiters prevent credential stuffing and denial-of-service attempts while exempting local static assets to preserve sub-50ms render times.</li>
              <li><strong>PBKDF2 Password Hashing:</strong> Credentials are salted with 16-byte random salts and hashed via 100,000 rounds of PBKDF2-HMAC-SHA256.</li>
            </ul>
          </div>
        </section>

        {/* SECTION 9: INTERNATIONAL TRANSFERS & DISPUTES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase tracking-wider">
            <Globe className="w-4 h-4" />
            <span>Section 9.0</span>
          </div>
          <h2 className="text-2xl font-bold text-white">9. Cross-Border Transfers, Standard Contractual Clauses, & Arbitration</h2>
          <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
            <p>
              For users located within the European Economic Area (EEA), United Kingdom, or Switzerland, international data transmissions comply with the <strong>European Commission's Standard Contractual Clauses (SCCs - Commission Implementing Decision (EU) 2021/914)</strong>.
            </p>
            <p>
              Any disputes arising from or relating to this Agreement or platform use shall be resolved through binding, confidential arbitration under the Commercial Arbitration Rules of the American Arbitration Association (AAA), rather than in court.
            </p>
          </div>
        </section>

        {/* SECTION 10: USER ACKNOWLEDGEMENT & COMPACT */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-blue-500/30 space-y-4">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="privacy_checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 accent-blue-600 rounded border-white/20 bg-slate-950 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="privacy_checkbox" className="text-xs text-slate-300 select-none cursor-pointer leading-relaxed">
              I have read, understood, and hereby consent to the <strong>Helpotron Platform Privacy Policy, Data Processing Agreement, and Zero-Data Retention Model Terms</strong> (v2026.2.4). I acknowledge my rights regarding data rectification, FERPA protections, and instantaneous account erasure.
            </label>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-500 font-mono">Status: {agreed ? "COMPACT ACCEPTED" : "AWAITING SIGNATURE"}</span>
            <button
              type="button"
              disabled={!agreed}
              onClick={handleAgree}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-xs font-semibold font-sans transition shadow-lg shadow-blue-600/20 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Initialize Workspace</span>
            </button>
          </div>
        </div>

        <footer className="text-center text-xs text-slate-500 pt-8 border-t border-white/5 space-y-1">
          <p>© 2026 Helpotron Automator Technologies, LLC. All rights reserved.</p>
          <p className="font-mono text-[10px]">Document Hash: sha256:7e98a3f5c1d89b2046e7f1a34d890b3952f416d482</p>
        </footer>
      </div>
    </div>
  );
}

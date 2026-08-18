import React, { useState, useMemo } from 'react';
import {
  Shield,
  Lock,
  FileText,
  CheckCircle2,
  ArrowLeft,
  Download,
  Scale,
  Cpu,
  Globe,
  Database,
  Key,
  Search,
  BookOpen,
  UserCheck,
  Server,
  AlertTriangle,
  FileCode,
  Layers,
  ChevronRight,
} from 'lucide-react';

const SECTIONS = [
  { id: 'sec-1', number: '1.0', title: 'Preamble, Scope, and Binding Nature', icon: Globe },
  { id: 'sec-2', number: '2.0', title: 'Comprehensive Categories of Data Collected', icon: Database },
  { id: 'sec-3', number: '3.0', title: 'Legal Bases and Purposes of Processing', icon: Scale },
  { id: 'sec-4', number: '4.0', title: 'AI, LLMs, and Automated Processing', icon: Cpu },
  { id: 'sec-5', number: '5.0', title: 'Third-Party Service Providers and Subprocessors', icon: Server },
  { id: 'sec-6', number: '6.0', title: 'Data Storage, Encryption, and Security Hardening', icon: Lock },
  { id: 'sec-7', number: '7.0', title: 'Data Retention and Account Lifecycle Policy', icon: FileText },
  { id: 'sec-8', number: '8.0', title: 'User Rights and Data Subject Access Mechanisms', icon: UserCheck },
  { id: 'sec-9', number: '9.0', title: "Children's Privacy & Educational Data (COPPA & FERPA)", icon: Shield },
  { id: 'sec-10', number: '10.0', title: 'International Data Transfers & Standard Contractual Clauses', icon: Globe },
  { id: 'sec-11', number: '11.0', title: 'Data Breach Notification Protocol (72-Hour Standard)', icon: AlertTriangle },
  { id: 'sec-12', number: '12.0', title: 'Policy Modifications and Notification Mechanisms', icon: Layers },
  { id: 'sec-13', number: '13.0', title: 'Data Protection Officer & Contact Information', icon: BookOpen },
  { id: 'sec-14', number: '14.0', title: 'US State-Specific Privacy Rights (CCPA/CPRA, VCDPA, CPA)', icon: FileCode },
  { id: 'sec-15', number: '15.0', title: 'Detailed Cookie, Tracking, and Local Storage Governance', icon: Key },
  { id: 'sec-16', number: '16.0', title: 'Educational Institution Data Protection Agreement (FERPA)', icon: Scale },
  { id: 'sec-17', number: '17.0', title: 'Technical Security Specification & Incident Protocols', icon: Shield },
  { id: 'sec-18', number: '18.0', title: 'Accessibility, Equal Access, and WCAG 2.1 AA Compliance', icon: UserCheck },
  { id: 'sec-19', number: '19.0', title: 'Final Legal Disclosures and Supremacy', icon: Scale },
];

export default function PrivacyPolicy({ onAgree, onClose }) {
  const [agreed, setAgreed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSection, setActiveSection] = useState('sec-1');

  const handleAgree = () => {
    if (agreed) {
      if (onAgree) onAgree();
      localStorage.setItem('helpotron_privacy_agreed', 'true');
    }
  };

  const scrollToSection = (id) => {
    setActiveSection(id);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleDownloadMarkdown = () => {
    const link = document.createElement('a');
    link.href = '/PRIVACY_POLICY.md';
    link.download = 'Helpotron_Privacy_Policy_v4.0.0.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-200 font-sans leading-relaxed selection:bg-blue-600 selection:text-white pb-24">
      {/* Sticky Header Bar */}
      <header className="sticky top-0 z-40 bg-[#090d16]/90 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Scale className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-white">Helpotron Privacy Policy & Data Governance Charter</h1>
            <p className="text-[11px] text-slate-400 font-mono">v4.0.0-PROD · Multi-Jurisdiction Legal Framework</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadMarkdown}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/5 transition font-medium"
            title="Download full Markdown policy"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Download .MD</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white hover:bg-white/5 transition flex items-center gap-1.5 font-medium"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Workspace</span>
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar Table of Contents */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="sticky top-24 rounded-2xl p-5 bg-slate-900/70 border border-white/10 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono">
                Charter Sections (19)
              </span>
              <span className="text-[10px] bg-blue-500/10 text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
                August 18, 2026
              </span>
            </div>

            {/* Quick Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Filter legal clauses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* Section Index List */}
            <nav className="max-h-[60vh] overflow-y-auto space-y-1 pr-1 custom-scrollbar text-xs">
              {SECTIONS.filter((s) => s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.number.includes(searchQuery)).map((s) => {
                const Icon = s.icon;
                const isActive = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollToSection(s.id)}
                    className={`w-full text-left p-2.5 rounded-xl transition flex items-center justify-between group cursor-pointer ${
                      isActive
                        ? 'bg-blue-600/20 border border-blue-500/30 text-white font-semibold'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className="font-mono text-[11px] text-blue-400 shrink-0">{s.number}</span>
                      <span className="truncate text-xs">{s.title}</span>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition ${isActive ? 'text-blue-400 translate-x-0.5' : 'text-slate-600 opacity-0 group-hover:opacity-100'}`} />
                  </button>
                );
              })}
            </nav>

            {/* Agreement Box in Sidebar */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="rounded accent-blue-500 w-4 h-4 mt-0.5 cursor-pointer"
                />
                <span className="leading-snug">
                  I formally acknowledge and accept the Helpotron Data Governance Charter and Privacy Terms.
                </span>
              </label>

              <button
                onClick={handleAgree}
                disabled={!agreed}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Accept Charter</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Document Content */}
        <main className="lg:col-span-8 space-y-10">
          {/* Document Hero */}
          <div className="border border-white/10 rounded-2xl p-8 bg-gradient-to-br from-slate-900/80 via-[#0f172a]/50 to-slate-950/90 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600/10 border border-blue-500/20 text-blue-400 text-xs font-mono mb-4 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>LEGAL-SPEC-v4.0.0-PROD · MONOLITHIC CHARTER</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              Privacy Policy and Comprehensive Data Governance Charter
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed">
              This authoritative legal document sets forth the comprehensive privacy rights, processing obligations, cryptographic lifecycle parameters, and cross-tenant boundary protections governing all data subjects, students, educators, and autonomous sub-agents across the Helpotron Automator platform.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px] font-semibold">Effective Date</span>
                <span className="text-white font-mono">August 18, 2026</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] font-semibold">Jurisdictions</span>
                <span className="text-white font-mono">GDPR, FERPA, CCPA</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] font-semibold">Inference Model</span>
                <span className="text-white font-mono">Zero-Retention (ZDR)</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px] font-semibold">DPO Office</span>
                <span className="text-white font-mono">dpo@helpotron.com</span>
              </div>
            </div>
          </div>

          {/* ─── SECTION 1.0 ─── */}
          <section id="sec-1" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Globe className="w-4 h-4" />
              <span>Section 1.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">1. Preamble, Scope, and Binding Nature</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>
                This Privacy Policy and Comprehensive Data Governance Charter ("Privacy Policy", "Policy") governs the collection, processing, storage, transmission, analysis, anonymization, and deletion of all personal data, academic records, audio streams, text transcripts, technical telemetry, and financial transaction records collected through the Helpotron Automator academic automation platform.
              </p>
              <p>
                This Policy applies to all services, software extensions, and automated systems operated by Helpotron Automator Systems Inc. (“Helpotron”, “Company”, “We”, “Us”, or “Our”), including the Web Application Dashboard, Canvas Browser Extension, Autonomous Collection Agent, Audio Transcription Engine, Generative Study Tool Suite, and the Research Data Lake.
              </p>
            </div>
          </section>

          {/* ─── SECTION 2.0 ─── */}
          <section id="sec-2" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Database className="w-4 h-4" />
              <span>Section 2.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">2. Comprehensive Categories of Data Collected</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-4 leading-relaxed">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
                <strong className="text-white block font-semibold">2.1 Information Provided Directly by the User:</strong>
                <ul className="list-disc pl-5 space-y-1 text-slate-300 text-xs">
                  <li><strong>Account Credentials:</strong> Unique public pseudonym (`public_id`), salted PBKDF2 password hashes (100,000+ HMAC-SHA256 iterations), and cryptographic session tokens.</li>
                  <li><strong>Stylistic Profiles:</strong> Custom writing excerpts and essays uploaded to train few-shot style mimicry templates (average sentence length, lexical diversity, cadence).</li>
                  <li><strong>Financial Ledgers:</strong> Subscription tier records (Basic, Pro, Elite), token usage ledgers, and Stripe transaction references. (Helpotron never stores raw credit card numbers or CVVs).</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
                <strong className="text-white block font-semibold">2.2 Academic & LMS Data via Browser Extension:</strong>
                <p className="text-xs text-slate-300">
                  When active on Canvas LMS (`*.instructure.com`), the extension captures assignment titles, descriptions, due dates, rubrics, and syllabus materials. The Autonomous Browser Agent operates in read-only mode and never alters submissions or accesses non-course administrative resources.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
                <strong className="text-white block font-semibold">2.3 Audio Recordings & Lecture Transcripts:</strong>
                <p className="text-xs text-slate-300">
                  Classroom audio (.webm, .wav, .mp3, .m4a) processed via Gemini 3.1 Flash-Lite or faster-whisper. Raw audio in staging is purged automatically within 24 hours post-transcription.
                </p>
              </div>
            </div>
          </section>

          {/* ─── SECTION 3.0 ─── */}
          <section id="sec-3" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Scale className="w-4 h-4" />
              <span>Section 3.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">3. Legal Bases and Purposes of Processing (GDPR Art. 6)</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/5">
                  <strong className="text-blue-400 block mb-1">1. Contractual (Art. 6(1)(b))</strong>
                  <span>Delivering study guides, active recall flashcards, practice tests, and credit billing management.</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/5">
                  <strong className="text-emerald-400 block mb-1">2. Legitimate Interests (Art. 6(1)(f))</strong>
                  <span>Infrastructure firewall defense, brute-force mitigation, bot detection, and rate limiting.</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-white/5">
                  <strong className="text-purple-400 block mb-1">3. Explicit Consent (Art. 6(1)(a))</strong>
                  <span>Data Lake anonymized contributions, style calibration, and optional Telegram notification alerts.</span>
                </div>
              </div>
            </div>
          </section>

          {/* ─── SECTION 4.0 ─── */}
          <section id="sec-4" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Cpu className="w-4 h-4" />
              <span>Section 4.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">4. Artificial Intelligence, Large Language Models, and Automated Processing</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>
                Helpotron deploys a multi-tier foundation model architecture:
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-300">
                <li><strong>Tier 1 — High-Throughput Workers (Gemini 3.1 Flash-Lite, DeepSeek-V4-Flash):</strong> High-frequency flashcard generation, 2-minute class prep digests, topic classification, and slide structural outlines.</li>
                <li><strong>Tier 2 — Advanced Reasoning Specialists (Gemini 3.7 Flash, DeepSeek-Chat):</strong> Multi-page comprehensive study guides, pedagogical practice tests, visual layout design logic, and presentation narrative synthesis.</li>
                <li><strong>Tier 3 — Neural Audio & Transcription (Local Faster-Whisper, Gemini Multimodal Speech):</strong> High-precision lecture transcription with speaker diarization and timestamps.</li>
                <li><strong>Presentation Pure-Gemini Bypass:</strong> Slide and PowerPoint assignments (`.pptx`, `.ppt`, `.gslides`) bypass general LLMs and execute 100% on Google Gemini with customizable model ratio splits.</li>
                <li><strong>Zero Data Retention (ZDR):</strong> Commercial enterprise API tiers mandate zero data retention. Your coursework and prompts are never used to train public foundation models.</li>
              </ul>
            </div>
          </section>

          {/* ─── SECTION 5.0 ─── */}
          <section id="sec-5" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Server className="w-4 h-4" />
              <span>Section 5.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">5. Third-Party Service Providers and Subprocessors</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-white/10 rounded-xl overflow-hidden">
                <thead className="bg-slate-950 text-slate-300 border-b border-white/10">
                  <tr>
                    <th className="p-3">Subprocessor</th>
                    <th className="p-3">Function</th>
                    <th className="p-3">Jurisdiction</th>
                    <th className="p-3">Security Safeguards</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-slate-900/60 text-slate-300">
                  <tr>
                    <td className="p-3 font-semibold text-white">Google Cloud / Gemini</td>
                    <td className="p-3">AI Inference & Transcription</td>
                    <td className="p-3">US / Global</td>
                    <td className="p-3 font-mono">SOC 2 Type II, TLS 1.3, HIPAA</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">DeepSeek AI</td>
                    <td className="p-3">Auxiliary Model Reasoning</td>
                    <td className="p-3">Regional API</td>
                    <td className="p-3 font-mono">Zero-Retention DPA</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">Stripe, Inc.</td>
                    <td className="p-3">Subscription Billing</td>
                    <td className="p-3">US / EU</td>
                    <td className="p-3 font-mono">PCI-DSS Level 1</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">Let's Encrypt (ISRG)</td>
                    <td className="p-3">SSL/TLS Authority</td>
                    <td className="p-3">US</td>
                    <td className="p-3 font-mono">Automated ACME Protocol</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ─── SECTION 6.0 ─── */}
          <section id="sec-6" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Lock className="w-4 h-4" />
              <span>Section 6.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">6. Data Storage, Encryption, and Security Hardening</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>
                Helpotron implements defense-in-depth infrastructure protections:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">
                <li><strong>Data in Transit:</strong> Mandatory TLS 1.3 and HSTS (`max-age=63072000; includeSubDomains; preload`).</li>
                <li><strong>Data at Rest:</strong> Database volumes and student records encrypted with AES-256.</li>
                <li><strong>Password Hashes:</strong> Salted PBKDF2 with 100,000+ SHA-256 iterations and random 16-byte salts.</li>
                <li><strong>Host Hardening:</strong> UFW firewall exposing only ports 22, 80, 443; Uvicorn loopback binding (`127.0.0.1:8000`), Fail2ban brute-force jails.</li>
              </ul>
            </div>
          </section>

          {/* ─── SECTION 7.0 ─── */}
          <section id="sec-7" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <FileText className="w-4 h-4" />
              <span>Section 7.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">7. Data Retention and Account Lifecycle Policy</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>
                Personal study records are retained for the duration of active subscription. Inactive accounts with zero logins for 24 consecutive months are flagged for automated purge. Raw audio uploads in `/uploads` are expunged within 24 hours of successful transcript generation.
              </p>
            </div>
          </section>

          {/* ─── SECTION 8.0 ─── */}
          <section id="sec-8" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <UserCheck className="w-4 h-4" />
              <span>Section 8.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">8. User Rights and Data Subject Access Mechanisms</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>
                Under GDPR and CCPA/CPRA, users possess the Right to Access, Rectification, Erasure (Right to be Forgotten), and Portability. Students can trigger instant downloads of flashcards in CSV, tests in JSON, and study guides in Markdown via `/api/export/*` or request complete cryptographic data wipes via `dpo@helpotron.com`.
              </p>
            </div>
          </section>

          {/* ─── SECTION 9.0 ─── */}
          <section id="sec-9" className="space-y-4 clean-card p-6 border border-white/10 bg-slate-900/40">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <Shield className="w-4 h-4" />
              <span>Section 9.0</span>
            </div>
            <h2 className="text-xl font-bold text-white">9. Children's Privacy and Educational Data Protection (COPPA & FERPA)</h2>
            <div className="text-xs sm:text-sm text-slate-300 space-y-3 leading-relaxed">
              <p>
                Helpotron is designed for high school, undergraduate, and graduate learners and does not knowingly collect information from children under thirteen (13). When deployed in educational institutions, Helpotron acts as a "School Official" under FERPA (34 CFR § 99.31(a)(1)(i)), maintaining student record ownership with the institution.
              </p>
            </div>
          </section>

          {/* ─── SECTION 10.0 to 19.0 OVERVIEW CARDS ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <section id="sec-10" className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
              <div className="text-xs font-mono text-blue-400 font-bold">Section 10.0 · Cross-Border Transfers</div>
              <h3 className="text-sm font-bold text-white">International Data Transfers</h3>
              <p className="text-xs text-slate-300">Protected via European Commission Standard Contractual Clauses (SCCs) and end-to-end TLS 1.3 encryption.</p>
            </section>

            <section id="sec-11" className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
              <div className="text-xs font-mono text-blue-400 font-bold">Section 11.0 · Security Incidents</div>
              <h3 className="text-sm font-bold text-white">72-Hour Breach Notification</h3>
              <p className="text-xs text-slate-300">Mandates regulatory disclosures to supervisory authorities within 72 hours and prompt student notification.</p>
            </section>

            <section id="sec-14" className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
              <div className="text-xs font-mono text-blue-400 font-bold">Section 14.0 · State Privacy Laws</div>
              <h3 className="text-sm font-bold text-white">CCPA / CPRA & US State Addenda</h3>
              <p className="text-xs text-slate-300">Zero selling or sharing of student data for cross-context behavioral advertising; full right to delete and correct.</p>
            </section>

            <section id="sec-18" className="p-5 rounded-2xl bg-slate-900/60 border border-white/10 space-y-2">
              <div className="text-xs font-mono text-blue-400 font-bold">Section 18.0 · Universal Design</div>
              <h3 className="text-sm font-bold text-white">WCAG 2.1 AA Accessibility</h3>
              <p className="text-xs text-slate-300">Minimum 4.5:1 text contrast ratios, complete keyboard navigability, focus-trapped dialogs, and screen reader compatibility.</p>
            </section>
          </div>

          {/* ─── SECTION 13.0 DPO CONTACT ─── */}
          <section id="sec-13" className="clean-card p-6 border border-blue-500/30 bg-gradient-to-r from-blue-950/30 to-slate-950/60 space-y-3">
            <div className="flex items-center gap-2 text-blue-400 font-mono text-xs uppercase font-bold">
              <BookOpen className="w-4 h-4" />
              <span>Section 13.0</span>
            </div>
            <h2 className="text-lg font-bold text-white">Data Protection Officer & Compliance Contact</h2>
            <p className="text-xs text-slate-300">
              For formal statutory rights requests, FERPA institutional agreements, or security disclosures:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono pt-2">
              <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
                <span className="text-slate-500 block text-[10px]">DPO Inquiries</span>
                <strong className="text-blue-300">dpo@helpotron.com</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
                <span className="text-slate-500 block text-[10px]">Security Incident Response</span>
                <strong className="text-emerald-300">security@helpotron.com</strong>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/80 border border-white/5">
                <span className="text-slate-500 block text-[10px]">Accessibility Coordinator</span>
                <strong className="text-purple-300">accessibility@helpotron.com</strong>
              </div>
            </div>
          </section>

          {/* Final Agreement CTA */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-white">Ready to proceed with verified privacy protection?</h3>
              <p className="text-xs text-slate-300 mt-0.5">Your study data remains 100% private, encrypted, and student-owned.</p>
            </div>
            <button
              onClick={() => {
                setAgreed(true);
                if (onAgree) onAgree();
                if (onClose) onClose();
                localStorage.setItem('helpotron_privacy_agreed', 'true');
              }}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-lg shadow-blue-500/20 shrink-0"
            >
              Accept Charter & Enter Workspace
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { 
  Scale, Shield, BookOpen, Coins, Sparkles, Gavel, FileCode, AlertOctagon, 
  ArrowLeft, CheckCircle2, ChevronRight 
} from 'lucide-react';
import SectionCard from './SectionCard.jsx';

export default function TermsOfServiceView({ onBack = null }) {
  const [activeSection, setActiveSection] = useState('all');

  const SECTIONS = [
    {
      id: 'academic',
      icon: BookOpen,
      color: 'text-emerald-400',
      title: '1. Academic Integrity & Student Honor Code Obligations',
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Helpotron is designed and engineered exclusively as an <strong>assistive academic companion, study synthesizer, lecture transcription aid, and personal research accelerator</strong>. It is strictly intended for personal study, review, practice testing, and learning acceleration.
          </p>
          <div className="bg-slate-900/80 border border-emerald-500/30 rounded-xl p-4 space-y-2">
            <div className="font-bold text-emerald-400">Mandatory Honor Code Warranties:</div>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li>You agree to utilize Helpotron in strict compliance with your educational institution's academic honor codes, student handbooks, and specific course syllabi.</li>
              <li>You warrant that you will <strong>never</strong> utilize Helpotron to generate responses during live proctored examinations, closed-book tests, or unauthorized assessments.</li>
              <li>You agree not to misrepresent autonomous AI outputs as your own original human intellectual work where prohibited by institutional policy.</li>
              <li>You assume sole, non-delegable academic responsibility for all coursework submitted to instructors. Helpotron disclaims all liability for academic disciplinary hearings, grade deductions, or institutional sanctions.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'credits',
      icon: Coins,
      color: 'text-amber-400',
      title: '2. Virtual Compute Credits & Token Economy ("$0 Cash Value")',
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Helpotron operates an internal virtual compute credit system ("Compute Credits") to manage infrastructure and multi-model inference token dispatching.
          </p>
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 space-y-2">
            <div className="font-bold text-amber-400">Legal Status of Compute Credits:</div>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong>Zero Monetary Value:</strong> Compute Credits represent a limited, revocable, personal software license with <strong>$0.00 USD cash value</strong>.</li>
              <li><strong>Non-Refundable &amp; Non-Transferable:</strong> Credits cannot be refunded, exchanged for cash, traded, sold, or transferred between accounts.</li>
              <li><strong>Forfeiture on Account Termination:</strong> Upon voluntary account deletion or termination for terms violations, all unconsumed Compute Credits are immediately and permanently forfeited without compensation.</li>
              <li><strong>Consumption Rates:</strong> Credits are debited based on real-time token volume across model tiers (Nemotron Nano, Gemini Flash Lite, DeepSeek V4 Flash/Pro) and audio transcription duration.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'ai-disclaimer',
      icon: Sparkles,
      color: 'text-purple-400',
      title: '3. Artificial Intelligence Disclaimers & Technical Limitations',
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            Generative AI models generate text and code outputs through stochastic probabilistic associations, not conscious reasoning.
          </p>
          <div className="bg-slate-900/80 border border-purple-500/30 rounded-xl p-4 space-y-2">
            <div className="font-bold text-purple-400">Statutory AI Disclaimers:</div>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-300">
              <li><strong>No Warranty of Factual Accuracy:</strong> AI-generated summaries, flashcards, and citations may occasionally contain factual errors or "hallucinations". You must independently verify all calculations, historical dates, and scientific facts.</li>
              <li><strong>No Professional Advice:</strong> Helpotron does not provide licensed legal, medical, healthcare, financial, or certified professional engineering advice.</li>
              <li><strong>Zero Hallucination Liability:</strong> Under no circumstances shall Helpotron, LLC or its upstream AI subprocessors (OpenRouter, DeepSeek, Google Cloud) be liable for grading errors or losses resulting from model hallucinations.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'arbitration',
      icon: Gavel,
      color: 'text-indigo-400',
      title: '4. Mandatory Binding Arbitration & Class Action Waiver',
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-4 space-y-2">
            <div className="font-bold text-indigo-300 uppercase tracking-wider text-[11px]">Binding Individual Dispute Resolution</div>
            <p>
              YOU AND HELPOTRON, LLC AGREE THAT ALL DISPUTES, CLAIMS, OR CONTROVERSIES ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICES SHALL BE RESOLVED EXCLUSIVELY BY FINAL AND BINDING INDIVIDUAL ARBITRATION ADMINISTERED BY THE AMERICAN ARBITRATION ASSOCIATION (AAA) UNDER ITS CONSUMER ARBITRATION RULES IN NEW ORLEANS, LOUISIANA.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300 pt-1">
              <li><strong>Jury &amp; Court Trial Waiver:</strong> Both parties waive any constitutional or statutory right to a trial before a judge or jury in a court of law.</li>
              <li><strong>Class Action Waiver:</strong> All claims must be brought in an individual capacity. Neither party may act as a class plaintiff or class representative in any class, collective, or consolidated proceeding.</li>
              <li><strong>30-Day Opt-Out:</strong> You may opt out of binding arbitration by emailing written notice to <span className="text-indigo-400">legal@helpotron.com</span> within thirty (30) days of first registering your account.</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'ip-dmca',
      icon: FileCode,
      color: 'text-cyan-400',
      title: '5. Intellectual Property, User Content & DMCA Takedowns',
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <p>
            <strong>Your Content:</strong> You retain full ownership and copyright of all notes, homework prompts, syllabus files, and recordings you input into Helpotron. You grant Helpotron a limited operational license solely to process and generate study materials for you.
          </p>
          <p>
            <strong>AI Output Ownership:</strong> Helpotron assigns to you all of its right, title, and interest (if any) in the generated study cards and textual outputs.
          </p>
          <div className="bg-slate-900/80 border border-cyan-500/30 rounded-xl p-4 space-y-2">
            <div className="font-bold text-cyan-400">DMCA Copyright Agent (17 U.S.C. § 512):</div>
            <p className="text-[11px] text-slate-400">
              If you believe content hosted on the platform infringes your copyright, send formal DMCA notice to:<br />
              <strong>Helpotron, LLC — Copyright Compliance</strong><br />
              Email: <span className="text-cyan-400">dmca@helpotron.com</span> &bull; New Orleans, Louisiana, USA
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'liability',
      icon: AlertOctagon,
      color: 'text-rose-400',
      title: '6. Limitation of Liability & Louisiana Governing Law',
      content: (
        <div className="space-y-3 text-xs leading-relaxed text-slate-300">
          <div className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-4 space-y-2">
            <div className="font-bold text-rose-300 uppercase tracking-wider text-[11px]">Statutory Monetary Cap</div>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL HELPOTRON, LLC BE LIABLE FOR ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, OR PUNITIVE DAMAGES. TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF <strong>ONE HUNDRED DOLLARS ($100.00 USD)</strong> OR THE AMOUNT PAID BY YOU IN THE PRECEDING TWELVE (12) MONTHS.
            </p>
            <p className="pt-2 text-slate-400">
              <strong>Governing Law:</strong> These Terms and any non-arbitrable disputes are governed by and construed under the laws of the <strong>State of Louisiana, USA</strong>, with exclusive venue in the state and federal courts located in Orleans Parish, Louisiana.
            </p>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 text-slate-100 max-w-5xl mx-auto animate-fadeIn pb-16 font-sans">
      {/* Header Card */}
      <SectionCard 
        id="terms-header" 
        padding="p-6 sm:p-8" 
        className="bg-slate-950/80 border border-white/10 relative overflow-hidden" 
        header={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                <Scale className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Terms of Service &amp; End-User License Agreement</h1>
                <p className="text-xs text-slate-400 mt-0.5">Effective Date: August 31, 2026 &bull; Helpotron, LLC (New Orleans, LA, USA)</p>
              </div>
            </div>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer self-start sm:self-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
              </button>
            )}
          </div>
        }
      >
        <p className="text-xs text-slate-300 leading-relaxed pt-2">
          This Agreement governs your legal relationship with Helpotron, LLC regarding your access to our academic study synthesizers, browser extensions, APIs, and virtual compute credit features. Please review our mandatory arbitration clause and class action waiver in Section 4.
        </p>
      </SectionCard>

      {/* Filter / Jump Buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveSection('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
            activeSection === 'all' ? 'bg-indigo-600 text-white' : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/10'
          }`}
        >
          View All Sections
        </button>
        {SECTIONS.map(sec => (
          <button
            key={sec.id}
            onClick={() => setActiveSection(sec.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeSection === sec.id ? 'bg-indigo-600 text-white' : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/10'
            }`}
          >
            {sec.title.split('.')[1]?.trim() || sec.title}
          </button>
        ))}
      </div>

      {/* Sections List */}
      <div className="space-y-4">
        {SECTIONS.filter(sec => activeSection === 'all' || activeSection === sec.id).map(sec => {
          const Icon = sec.icon;
          return (
            <SectionCard
              key={sec.id}
              id={`terms-${sec.id}`}
              padding="p-6"
              className="rounded-2xl space-y-3 bg-slate-950/60 border border-white/10"
              title={
                <div className="flex items-center gap-2 text-sm sm:text-base font-bold text-white">
                  <Icon className={`w-5 h-5 ${sec.color}`} />
                  <span>{sec.title}</span>
                </div>
              }
            >
              {sec.content}
            </SectionCard>
          );
        })}
      </div>

      {/* Contact Footer */}
      <div className="glass-panel p-6 border border-white/10 text-center space-y-2">
        <div className="text-xs text-slate-400 font-mono">Helpotron, LLC &bull; Corporate Legal &bull; New Orleans, Louisiana, USA</div>
        <div className="text-xs text-slate-300">
          Questions regarding these Terms? Contact our legal team at <a href="mailto:legal@helpotron.com" className="text-indigo-400 hover:underline">legal@helpotron.com</a>
        </div>
      </div>
    </div>
  );
}

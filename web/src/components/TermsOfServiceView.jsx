import React from 'react';
import { FileText, Shield, Sparkles, ArrowLeft, CheckCircle, Scale, BookOpen } from 'lucide-react';
import SectionCard from './SectionCard.jsx';

export default function TermsOfServiceView({ onBack = null }) {
  return (
    <div className="space-y-6 text-slate-100 max-w-4xl mx-auto animate-fadeIn pb-12">
      {/* Header */}
      <SectionCard id="terms-header" padding="p-6 sm:p-8" className="bg-slate-950/60 border border-white/10 relative overflow-hidden" header={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Terms of Service & Fair Use Policy</h2>
            <p className="text-xs text-slate-400 mt-0.5">Effective Date: August 18, 2026 • Helpotron Automator v2.0</p>
          </div>
        </div>
      }>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
        )}
      </SectionCard>

      {/* Terms Sections */}
      <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
        <SectionCard id="terms-integrity" padding="p-6" className="rounded-2xl space-y-2" title="1. Academic Integrity & Honor Code Compliance">
          <p>
            Helpotron Automator is an academic companion designed strictly for personal study, review, and learning acceleration. Students must utilize study packs, flashcards, practice quizzes, and summaries in alignment with their school's honor code and academic integrity guidelines.
          </p>
        </SectionCard>

        <SectionCard id="terms-canvas" padding="p-6" className="rounded-2xl space-y-2" title="2. Canvas LMS & Third-Party Integration">
          <p>
            The Helpotron Chrome Extension operates locally in your browser. It extracts assignment text directly from visible course tabs and does not access, transmit, or store administrative Canvas passwords. All coursework processing is performed under fair use for educational review.
          </p>
        </SectionCard>

        <SectionCard id="terms-credits" padding="p-6" className="rounded-2xl space-y-2" title="3. Compute Credits & Purchases">
          <p>
            Compute credits purchased or earned via referrals and data contributions are designated solely for in-platform Helpotron compute generation tasks. Credits do not expire and cannot be redeemed for external cash.
          </p>
        </SectionCard>

        <SectionCard id="terms-ferpa" padding="p-6" className="rounded-2xl space-y-2" title="4. Data Ownership & FERPA Rights">
          <p>
            Students retain full ownership of their generated notes and transcripts. You may export your study repository at any time as JSON or permanently wipe your account via Self-Service Data Erasure.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

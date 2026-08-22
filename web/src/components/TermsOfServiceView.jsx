import React from 'react';
import { FileText, Shield, Sparkles, ArrowLeft, CheckCircle, Scale, BookOpen } from 'lucide-react';

export default function TermsOfServiceView({ onBack = null }) {
  return (
    <div className="space-y-6 text-slate-100 max-w-4xl mx-auto animate-fadeIn pb-12">
      {/* Header */}
      <div className="clean-card rounded-3xl p-6 sm:p-8 bg-slate-950/60 border border-white/10 relative overflow-hidden">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4 transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </button>
        )}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Terms of Service & Fair Use Policy</h1>
            <p className="text-xs text-slate-400 mt-0.5">Effective Date: August 18, 2026 • Helpotron Automator v2.0</p>
          </div>
        </div>
      </div>

      {/* Terms Sections */}
      <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
        <div className="clean-card p-6 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400" /> 1. Academic Integrity & Honor Code Compliance
          </h2>
          <p>
            Helpotron Automator is an academic companion designed strictly for personal study, review, and learning acceleration. Students must utilize study packs, flashcards, practice quizzes, and summaries in alignment with their school's honor code and academic integrity guidelines.
          </p>
        </div>

        <div className="clean-card p-6 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> 2. Canvas LMS & Third-Party Integration
          </h2>
          <p>
            The Helpotron Chrome Extension operates locally in your browser. It extracts assignment text directly from visible course tabs and does not access, transmit, or store administrative Canvas passwords. All coursework processing is performed under fair use for educational review.
          </p>
        </div>

        <div className="clean-card p-6 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-400" /> 3. Compute Credits & Purchases
          </h2>
          <p>
            Compute credits purchased or earned via referrals and data contributions are designated solely for in-platform Helpotron compute generation tasks. Credits do not expire and cannot be redeemed for external cash.
          </p>
        </div>

        <div className="clean-card p-6 rounded-2xl space-y-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" /> 4. Data Ownership & FERPA Rights
          </h2>
          <p>
            Students retain full ownership of their generated notes and transcripts. You may export your study repository at any time as JSON or permanently wipe your account via Self-Service Data Erasure.
          </p>
        </div>
      </div>
    </div>
  );
}

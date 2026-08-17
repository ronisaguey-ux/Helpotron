import React from 'react';

export default function PrivacyPolicyModal({ isOpen, onAccept, onDecline }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-white text-slate-900 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-md">
            📜
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Privacy Policy & Terms of Service</h2>
            <p className="text-xs text-slate-500 mt-0.5">Please review and agree to continue using Helpotron.</p>
          </div>
        </div>

        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-700 space-y-3 max-h-64 overflow-y-auto leading-relaxed">
          <p className="font-semibold text-slate-900">1. Academic Integrity & Responsible AI Use</p>
          <p>
            Helpotron is an academic productivity and learning companion designed to assist with studying, rubric breakdown, drafting, citation generation, and transcription. Users are responsible for adhering to their institutional honor codes and academic policies.
          </p>

          <p className="font-semibold text-slate-900">2. Data Ownership & Encryption</p>
          <p>
            Your assignment prompts, transcripts, notes, and profile settings remain exclusively your property. Data is encrypted in transit and at rest. We do not sell your personal data to third parties.
          </p>

          <p className="font-semibold text-slate-900">3. Multi-Engine Stealth & AI Evasion</p>
          <p>
            Our perplexity cadence optimizer and multi-checker evaluation are provided as stylistic enhancements to produce natural, diverse syntactic cadence in academic writing.
          </p>

          <p className="font-semibold text-slate-900">4. Guest & Read-Only Mode</p>
          <p>
            Declining these terms allows you to browse and inspect the application in Guest (Read-Only) mode. Action execution, task dispatch, and file generation will be restricted.
          </p>
        </div>

        <div className="space-y-2 pt-2">
          <button
            onClick={onAccept}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md transition-all flex items-center justify-center gap-2"
          >
            ✅ I Agree & Accept Terms (Full Access)
          </button>

          <button
            onClick={onDecline}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            ❌ Decline (Continue as Guest / Read-Only)
          </button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-slate-200">
      <h1 className="text-3xl font-black text-sky-400 mb-6">Helpotron Privacy Policy</h1>
      <p className="text-slate-400 mb-4">Last updated: August 20, 2026</p>
      
      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-100 mb-3">1. FERPA & Academic Data Protection</h2>
        <p className="leading-relaxed text-slate-300">
          Helpotron operates as a student-directed study platform. We do not sell student records or share assignment data with third parties. All Canvas assignment scrapes are processed ephemerally or stored securely under user control.
        </p>
      </section>
      
      <section className="mb-8">
        <h2 className="text-xl font-bold text-slate-100 mb-3">2. GDPR Article 17: Right to Erasure</h2>
        <p className="leading-relaxed text-slate-300">
          Users may permanently delete their account and all associated flashcards, study guides, and dumps at any time via Account Settings &rarr; Delete Account.
        </p>
      </section>
    </div>
  );
}

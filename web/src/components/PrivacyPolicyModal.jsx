import React, { useState } from 'react';
import PrivacyPolicy from '../PrivacyPolicy.jsx';
import { Shield, X } from 'lucide-react';

export default function PrivacyPolicyModal({ isOpen, onAccept, onDecline }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#090d16] text-slate-200 rounded-3xl max-w-6xl w-full border border-white/10 shadow-2xl flex flex-col max-h-[96vh] overflow-hidden relative">
        <PrivacyPolicy
          onAgree={onAccept}
          onClose={onDecline}
        />
      </div>
    </div>
  );
}

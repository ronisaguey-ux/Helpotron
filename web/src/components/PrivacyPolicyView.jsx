import React from 'react';
import { ArrowLeft, ArrowRight, Shield } from 'lucide-react';
import PrivacyPolicy from '../PrivacyPolicy.jsx';
import { AnimatedLogo } from './ui/AnimatedLogo.jsx';

export default function PrivacyPolicyView({ publicMode = false, onBack = null, onGoTo = null }) {
  return (
    <div className="w-full min-h-screen bg-background text-on-surface">
      {publicMode && (
        <header className="sticky top-0 z-30 w-full border-b border-outline-variant/30 bg-surface/80 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs font-semibold text-on-surface-variant hover:text-primary transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Helpotron
            </button>
            <div className="flex items-center gap-2">
              <AnimatedLogo size="sm" showWordmark={false} />
              <span className="font-bold text-sm text-primary tracking-tight">Helpotron Privacy</span>
            </div>
            {onGoTo && (
              <button
                type="button"
                onClick={() => onGoTo('signup')}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary hover:text-on-primary-container font-semibold text-xs transition cursor-pointer active:scale-95 shadow-sm"
              >
                Get Started <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </header>
      )}
      <div className="max-w-5xl mx-auto py-4">
        <PrivacyPolicy onBack={publicMode ? null : onBack} onAgree={() => {}} />
      </div>
    </div>
  );
}

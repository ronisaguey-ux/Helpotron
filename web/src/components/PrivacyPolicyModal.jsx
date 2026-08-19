import React, { useState } from 'react';

const SUBPROCESSORS = [
  { name: 'OpenRouter', purpose: 'AI model routing and inference', country: 'USA', link: 'https://openrouter.ai/privacy' },
  { name: 'Google Gemini', purpose: 'Audio transcription and vision processing', country: 'USA', link: 'https://policies.google.com/privacy' },
  { name: 'Stripe', purpose: 'Payment processing', country: 'USA', link: 'https://stripe.com/privacy' },
];

export default function PrivacyPolicyModal({ isOpen, onClose, onAccept, onDecline }) {
  const [tab, setTab] = useState('overview');

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Privacy Policy"
    >
      <div
        className="modal-container privacy-modal"
        onClick={e => e.stopPropagation()}
        data-modal-container
      >
        <div className="modal-header">
          <h2>Privacy &amp; Cookie Policy</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="modal-tabs">
          {['overview', 'cookies', 'subprocessors', 'rights'].map(t => (
            <button
              key={t}
              className={`tab-btn ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'overview' && (
            <div>
              <p>Helpotron collects your email, assignment content, and usage data to provide AI-powered academic assistance.</p>
              <p>We do not sell your data to third parties. Data is processed in accordance with GDPR (EU) 2016/679.</p>
            </div>
          )}
          {tab === 'cookies' && (
            <div>
              <h3>Cookies We Use</h3>
              <ul>
                <li><strong>helpotron_session</strong> — Authentication session (essential, 7 days)</li>
                <li><strong>theme_pref</strong> — UI theme preference (functional, 1 year)</li>
              </ul>
              <div className="cookie-actions">
                <button className="btn btn-primary" onClick={onAccept}>Accept All</button>
                <button className="btn btn-outline" onClick={onDecline}>Essential Only</button>
              </div>
            </div>
          )}
          {tab === 'subprocessors' && (
            <div>
              <h3>Data Subprocessors</h3>
              <table className="subprocessor-table">
                <thead><tr><th>Service</th><th>Purpose</th><th>Country</th><th>Policy</th></tr></thead>
                <tbody>
                  {SUBPROCESSORS.map(sp => (
                    <tr key={sp.name}>
                      <td>{sp.name}</td>
                      <td>{sp.purpose}</td>
                      <td>{sp.country}</td>
                      <td><a href={sp.link} target="_blank" rel="noopener noreferrer">View</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'rights' && (
            <div>
              <h3>Your GDPR Rights</h3>
              <ul>
                <li>📋 <strong>Right of Access</strong> — Request a copy of all your data</li>
                <li>✏️ <strong>Right to Rectification</strong> — Correct inaccurate data</li>
                <li>🗑️ <strong>Right to Erasure</strong> — Delete your account and all data via Settings</li>
                <li>📦 <strong>Right to Portability</strong> — Export your data as JSON</li>
                <li>🚫 <strong>Right to Object</strong> — Opt out of non-essential processing</li>
              </ul>
              <p>To exercise your rights, visit Settings → Account → Delete Account, or contact privacy@helpotron.com</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

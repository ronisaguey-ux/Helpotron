import React, { useState } from 'react';

const PrivacyPolicy = ({ onAgree }) => {
  const [agreed, setAgreed] = useState(false);

  const handleAgree = () => {
    if (agreed) {
      onAgree();
      // Store agreement in localStorage
      localStorage.setItem('helpotron_privacy_agreed', 'true');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg my-8">
      <h1 className="text-3xl font-bold text-center mb-6">Privacy Policy</h1>
      <p className="text-center text-gray-600 mb-6">Last updated: August 12, 2026</p>

      <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
        <p>
          <strong>Helpotron Automator</strong> ("we", "our", "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our application.
        </p>

        <h2 className="text-xl font-semibold mt-6">1. Information We Collect</h2>
        <h3 className="text-lg font-medium mt-4">1.1 Information You Provide</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Account Information:</strong> Public ID, Telegram ID, email address (if provided), and authentication tokens.</li>
          <li><strong>Academic Data:</strong> Assignment prompts, titles, due dates, file URLs, and progress data.</li>
          <li><strong>Transcripts:</strong> Audio recordings uploaded for transcription.</li>
          <li><strong>Study Materials:</strong> Generated study guides, flashcards, practice tests, and summaries.</li>
          <li><strong>Writing Samples:</strong> Text samples uploaded for voice cloning and style analysis.</li>
          <li><strong>Grade History:</strong> Grades, teacher notes, and feedback you choose to submit.</li>
          <li><strong>Settings:</strong> Your preferences for grade level, tone, writing style, retry attempts, and theme.</li>
        </ul>

        <h3 className="text-lg font-medium mt-4">1.2 Information Automatically Collected</h3>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Usage Data:</strong> Logs of your interactions with the service, including assignment processing, study material generation, and draft attempts.</li>
          <li><strong>Device Information:</strong> IP address, browser type, operating system, and device identifiers.</li>
          <li><strong>Cookies:</strong> Essential cookies for authentication and session management.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">2. How We Use Your Information</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Service Delivery:</strong> To process assignments, generate study materials, transcribe lectures, and provide the core functionality.</li>
          <li><strong>Personalization:</strong> To adapt content to your grade level, writing style, and preferences.</li>
          <li><strong>Improvement:</strong> To analyze usage patterns and improve our AI models and features.</li>
          <li><strong>Communication:</strong> To send alerts, notifications, and updates about your assignments and account.</li>
          <li><strong>Billing:</strong> To process payments and manage your subscription.</li>
          <li><strong>Support:</strong> To respond to your inquiries and provide technical support.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">3. Data Sharing</h2>
        <p>We do not sell your personal data. We may share your information in the following cases:</p>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Service Providers:</strong> Third-party vendors (e.g., Stripe for payments, OpenAI for LLM processing, Telegram for notifications) that process data on our behalf.</li>
          <li><strong>Legal Compliance:</strong> If required by law, court order, or government regulation.</li>
          <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, your data may be transferred.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">4. Data Security</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>We implement industry-standard encryption (TLS) for all data in transit.</li>
          <li>API keys and sensitive credentials are stored as environment variables, never exposed in client-side code.</li>
          <li>We use rate limiting and authentication checks to prevent unauthorized access.</li>
          <li>We do not store raw audio files after transcription.</li>
          <li>Despite these measures, no method of transmission over the internet is 100% secure.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">5. User Rights</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Access:</strong> You can request a copy of your data.</li>
          <li><strong>Correction:</strong> You can update your settings and account information.</li>
          <li><strong>Deletion:</strong> You can request deletion of your account and associated data.</li>
          <li><strong>Opt-out:</strong> You can disable optional data submissions (grades, teacher notes).</li>
          <li>To exercise any of these rights, contact us via Telegram or email.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">6. Data Retention</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>We retain your data as long as your account is active.</li>
          <li>If you delete your account, we will delete or anonymize your personal data within 30 days.</li>
          <li>Aggregated, anonymized data may be retained for analytics purposes.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">7. Third-Party Services</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Stripe:</strong> Payment processing — see <a href="https://stripe.com/privacy" className="text-blue-600 underline">Stripe's Privacy Policy</a>.</li>
          <li><strong>DeepSeek:</strong> LLM processing — see <a href="https://platform.deepseek.com/privacy" className="text-blue-600 underline">DeepSeek's Privacy Policy</a>.</li>
          <li><strong>Telegram:</strong> Notifications — see <a href="https://telegram.org/privacy" className="text-blue-600 underline">Telegram's Privacy Policy</a>.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">8. Children's Privacy</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Our service is intended for students and adult users.</li>
          <li>We do not knowingly collect personal information from children under 13 without parental consent.</li>
          <li>If you believe we have collected such data, please contact us to delete it.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">9. International Data Transfers</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Your data may be processed on servers located in the United States and other countries.</li>
          <li>By using the service, you consent to the transfer of your data to these locations.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">10. Changes to This Policy</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>We may update this Privacy Policy from time to time.</li>
          <li>We will notify you of significant changes via the website or Telegram.</li>
          <li>Your continued use after changes indicates acceptance of the updated policy.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6">11. Contact Us</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Telegram:</strong> @your_bot_username</li>
          <li><strong>Email:</strong> helpotron@example.com</li>
        </ul>
      </div>

      <div className="mt-8 border-t pt-6 flex flex-col items-center">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={() => setAgreed(!agreed)}
            className="w-5 h-5 accent-blue-600"
          />
          <span className="text-gray-700">
            I have read and agree to the Privacy Policy and Terms of Service.
          </span>
        </label>
        <button
          onClick={handleAgree}
          disabled={!agreed}
          className={`mt-4 px-8 py-3 rounded-lg font-medium transition-colors ${
            agreed
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

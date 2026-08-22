# 🛡️ Security Policy — Helpotron Automator

Helpotron Automator is committed to protecting student academic records, personal study materials, and system infrastructure. We take security vulnerabilities seriously and appreciate responsible disclosures from the security community.

---

## 📋 Supported Versions

We actively provide security patches and updates for the following versions of Helpotron Automator:

| Version | Supported | Security Maintenance Level |
| :--- | :--- | :--- |
| **2.0.x** | ✅ Yes | Current Active Release (Full Security & Bugfix Support) |
| **1.0.x** | ⚠️ Critical Only | Critical Security Patches Only |
| **< 1.0** | ❌ No | Deprecated — Please upgrade to v2.0+ |

---

## 🔒 Responsible Vulnerability Reporting

If you discover a security vulnerability or potential threat in Helpotron Automator (including the web app, backend FastAPI server, Chrome extension, or SQLite datalake):

1. **Do NOT open a public GitHub issue.**
2. Email your report directly to our security team at:
   ```
   security@helpotron.com
   ```
   *(or open an encrypted advisory on GitHub via Security Advisories)*

### What to Include in Your Report:
- A detailed description of the vulnerability and potential impact.
- Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
- Affected endpoints, files, or components (e.g. `server/admin.py`, `extension/content.js`).
- Any suggestions for mitigation or remediation.

---

## ⏱️ Response SLA & Disclosure Timeline

- **Initial Acknowledgment:** Within **24 to 48 hours** of receiving the report.
- **Triage & Severity Assessment:** Within **3 business days**.
- **Fix & Patch Deployment:** Critical vulnerabilities are patched within **7 calendar days**.
- **Public Disclosure:** Coordinated disclosure after the patch has been released and verified in production.

---

## 🛡️ Core Security Architecture & Commitments

- **Zero Plaintext Password Storage:** Passwords hashed with bcrypt; authentication sessions signed with cryptographic JWT tokens.
- **Local-First Canvas Token Isolation:** Canvas LMS API tokens and scraping sessions remain in the student's browser storage; tokens are never persisted in plain database records.
- **FERPA & COPPA Compliance:** Educational assignment records are encrypted at rest (AES-256) and in transit (TLS 1.3). Students have self-service one-click account and data erasure rights.
- **Deterministic Math Execution:** Math equations are computed through deterministic Python subprocess sandboxes to prevent LLM hallucinations.
- **Sandboxed Agent Execution:** Browser automation agents operate with restricted permissions and no arbitrary root access.

---

Thank you for helping keep Helpotron Automator safe and secure for all students!

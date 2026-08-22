# PRIVACY POLICY AND DATA GOVERNANCE CHARTER
### Helpotron Automator Platform
**Effective Date:** August 18, 2026  
**Last Updated:** August 18, 2026  
**Document Version:** 4.0.0-PROD  
**Legal Entity:** Helpotron Automator Systems Inc. (“Helpotron”, “Company”, “We”, “Us”, or “Our”)  
**Data Protection Officer (DPO) Contact:** `dpo@helpotron.com`  
**Security & Legal Compliance:** `compliance@helpotron.com`  
**Applicable Jurisdictions:** United States (Federal, California CCPA/CPRA, Virginia VCDPA, Colorado CPA, Florida FDBR), European Union & United Kingdom (General Data Protection Regulation - GDPR / UK-GDPR), Canada (PIPEDA), and International Student Data Privacy Standards (FERPA & COPPA compliant frameworks).

---

## Table of Contents
1. [Preamble, Scope, and Binding Nature](#1-preamble-scope-and-binding-nature)
2. [Comprehensive Categories of Data Collected](#2-comprehensive-categories-of-data-collected)
3. [Legal Bases and Purposes of Processing](#3-legal-bases-and-purposes-of-processing)
4. [Artificial Intelligence, Large Language Models, and Automated Processing](#4-artificial-intelligence-large-language-models-and-automated-processing)
5. [Third-Party Service Providers and Subprocessors](#5-third-party-service-providers-and-subprocessors)
6. [Data Storage, Encryption, and Security Hardening](#6-data-storage-encryption-and-security-hardening)
7. [Data Retention and Account Lifecycle Policy](#7-data-retention-and-account-lifecycle-policy)
8. [User Rights and Data Subject Access Mechanisms](#8-user-rights-and-data-subject-access-mechanisms)
9. [Children's Privacy and Educational Data Protection (COPPA & FERPA)](#9-childrens-privacy-and-educational-data-protection-coppa--ferpa)
10. [International Data Transfers](#10-international-data-transfers)
11. [Data Breach Notification Protocol](#11-data-breach-notification-protocol)
12. [Policy Modifications and Notification Mechanisms](#12-policy-modifications-and-notification-mechanisms)
13. [Data Protection Officer & Contact Information](#13-data-protection-officer--contact-information)
14. [US State-Specific Privacy Rights and Statutory Addenda](#14-us-state-specific-privacy-rights-and-statutory-addenda)
15. [Detailed Cookie, Tracking, and Local Storage Governance](#15-detailed-cookie-tracking-and-local-storage-governance)
16. [Educational Institution Data Protection Agreement (FERPA Addendum)](#16-educational-institution-data-protection-agreement-ferpa-addendum)
17. [Technical Security Specification and Incident Protocols](#17-technical-security-specification-and-incident-protocols)
18. [Accessibility, Equal Access, and Non-Discrimination Policy](#18-accessibility-equal-access-and-non-discrimination-policy)
19. [Final Legal Disclosures and Supremacy](#19-final-legal-disclosures-and-supremacy)

---

## 1. PREAMBLE, SCOPE, AND BINDING NATURE

### 1.1 Scope and Application
This Privacy Policy and Comprehensive Data Governance Charter ("Privacy Policy", "Policy") governs the collection, processing, storage, transmission, analysis, anonymization, and deletion of all personal data, academic records, audio streams, text transcripts, technical telemetry, and financial transaction records collected through the Helpotron Automator academic automation platform.

This Policy applies to all services, applications, software extensions, and automated systems operated by Helpotron, including but not limited to:
- **The Helpotron Web Application & Student Dashboard** (hosted at `https://helpotron.com` and associated subdomains).
- **The Helpotron Academic Browser Extension** (running on Google Chrome, Chromium-based browsers, and associated manifest environments).
- **The Autonomous Browser Collection Agent Sub-system** (WebSocket-bridged automation interface connecting browser sessions to backend orchestration).
- **The Helpotron Lecture Audio Recorder & Transcription Engine** (including WebM/WAV recording handlers, Whisper API processing, and multimodal transcription pipelines).
- **The Helpotron Study Material Generation Services** (encompassing algorithmic synthesis of study guides, active recall flashcards, multi-tier practice tests, and 2-minute class prep digests).
- **The Assignment Draft & Style Mimicry Workflow** (including custom stylistic few-shot calibration, iterative AI detection scoring, and risk classification mechanisms).
- **The Helpotron Telegram Notification & Command Bot** (operating via the Telegram Bot API).
- **The Helpotron Enterprise & Educational Organization Portals** (encompassing institution-level, district-level, and study-group administrative collaboration services).
- **The Helpotron Research Data Lake & Data Discount Program** (governing voluntary opt-in anonymized academic dataset contributions).

### 1.2 User Acknowledgement and Consent
By registering an account, installing the Helpotron browser extension, uploading audio or text files, initiating autonomous collection sessions, redeeming promotional tokens, or accessing any endpoint across our public API, you (“User”, “Student”, “Educator”, or “Subscriber”) formally acknowledge that you have read, understood, and agreed to the practices described in this Policy.

If you are accessing or using Helpotron on behalf of an educational institution, school district, university, or corporate team, you represent and warrant that you possess the requisite authority to bind that entity to this Policy, and that your use complies with all applicable institutional data governance bylaws and statutory student record frameworks.

If you do not agree with any provision of this Privacy Policy, you must immediately terminate your use of Helpotron, uninstall the browser extension, and submit an account deletion request to `dpo@helpotron.com`.

---

## 2. COMPREHENSIVE CATEGORIES OF DATA COLLECTED

To deliver our high-performance academic assistance tools, autonomous study workflows, and generative study artifacts, Helpotron collects specific categories of personal, academic, technical, and transactional data. We strictly adhere to the principle of data minimization: we collect only data that is strictly necessary to fulfill our educational service objectives, secure our infrastructure, or satisfy regulatory obligations.

### 2.1 Information Provided Directly by the User
- **Account Identification & Authentication Credentials**:
  - Public User Identifier (`public_id`): A unique alphanumeric username or pseudonym selected during onboarding.
  - Cryptographic Authentication Records: Salted PBKDF2 password hashes (`password_hash` and `password_salt` generated with 100,000+ HMAC-SHA256 iterations), cryptographic session tokens, and CSRF token pairs.
  - Contact Identifiers (Optional): Email address provided during enterprise onboarding or password recovery flows, and Telegram User ID (`telegram_id`) provided during Telegram Bot linking.
  - User Profile Preferences: Selected academic reading level (e.g., 9th grade, 10th grade, 11th grade, 12th grade, college-freshman, sophomore), target grade averages, notification preferences, dark/light theme configurations, and interface localization settings.
- **Student Writing Samples & Stylistic Calibration Data**:
  - Custom Writing Text: Unedited essays, historical academic papers, and writing samples uploaded by the student into the Stylistic Profile Vault (`server/draft.py`) to train few-shot prompt templates for style mimicry.
  - Vocabulary and Tone Metrics: Lexical density profiles, average sentence length distributions, syntactic complexity indices, and characteristic transition phrase patterns extracted from submitted samples.
- **Payment & Financial Transaction Records**:
  - Credit Ledger & Subscription Status: Active tier classification (Basic, Pro, Elite), current credit balance, historical credit expenditure deltas, discount balances, and rollover spillover ledgers.
  - Payment Processor Metadata: Transaction identifiers (`provider_ref`), timestamps, currency, total amounts charged, and transaction status (`captured`, `manual`, `refunded`).
  - *Note on Financial Data Processing*: Helpotron does NOT collect, store, or process raw credit card numbers, CVVs, bank account numbers, or debit card PINs. All payment card information is collected and processed directly by our PCI-DSS Level 1 certified third-party payment partner (Stripe, Inc.) or confirmed via manual peer-to-peer transaction logs.

### 2.2 Academic & Learning Management System (LMS) Data Collected via Browser Extension
When the Helpotron Academic Browser Extension is active on authorized Canvas LMS domains (`*.instructure.com` or custom university domains configured by the student), the extension collects:
- **Assignment Metadata & Requirements**:
  - Assignment Title, Canvas Assignment ID (`canvas_id`), Course Name, Course ID, and Module Name.
  - Due dates, lock dates, submission cutoffs, and historical submission statuses.
  - Complete assignment prompts, rubric criteria, scoring point distributions, and instructor guidelines.
  - Document URLs and resource hyperlinks referenced within the assignment description.
- **Autonomous Browser Collection Agent Artifacts**:
  - When the user explicitly triggers the "Activate Collection Agent" feature, our autonomous collection agent logs interaction events (navigation targets, link traversal paths, and page reading timestamps).
  - Scraped page text from corresponding syllabus entries, module lecture notes, instructor discussion boards, and attached reading summaries.
  - Extracted text is transformed into structured academic transcripts (source: "agent") stored within our encrypted PostgreSQL/SQLite database.
  - *Safety Boundary*: The browser agent operates exclusively within the user's active, authenticated browser session. The agent is strictly restricted to read-only traversal; it is hardcoded to never click submission buttons, alter student responses, or access non-course administrative resources.

### 2.3 Audio Recordings & Lecture Transcripts
- **Raw Audio Uploads & Microphone Streams**:
  - Audio files (`.webm`, `.wav`, `.mp3`, `.m4a`, `.ogg`) recorded via the browser extension recorder or uploaded manually by the user.
  - Audio metadata including sampling rate, duration in seconds, file format, and channel count.
- **Transcribed Academic Text**:
  - Full textual transcripts generated by our transcription pipelines (local faster-whisper models or secure multimodal API endpoints).
  - Word-level timestamps, speaker diarization tags, confidence scores, and lecture topic segmentation boundaries.

### 2.4 Automatically Generated Study Materials & AI Output
- **Synthetic Educational Artifacts**:
  - Structured Study Guides (key concepts, definitions, thematic summaries, sample exam questions).
  - Active Recall Flashcard Decks (question/answer pairs formatted as JSON and exportable to Quizlet and Anki CSVs).
  - Interactive Practice Tests (multiple-choice questions, option sets, answer indices, rationales, and short-answer prompts with model solutions).
  - 2-Minute Lecture Summaries (thesis points, core arguments, memorable case studies, and instructor questions).
  - Assignment Drafts, iterative revisions, and style-aligned text blocks.
- **AI Detection & Authenticity Scoring Telemetry**:
  - Multi-detector composite scores (0–100 scale), per-detector sub-scores (from integrated detection engines), variance metrics, perplexity estimates, and pass/fail/risky classification flags.

### 2.5 Study Session Analytics & Telemetry
- **Learning Behavioral Analytics**:
  - Duration of study sessions (minutes spent per material, time-of-day engagement patterns).
  - Flashcard review completion rates, retention accuracy, practice test scores, and re-attempt frequencies.
  - Gamification metrics (earned XP, streak counts, scholar badge unlocks).
- **Technical & Device Telemetry**:
  - Client IP addresses, browser user-agent strings, operating system versions, and screen resolution.
  - API request rates, endpoint latency profiles, WebSocket bridge connection durations, and error tracebacks.

---

## 3. LEGAL BASES AND PURPOSES OF PROCESSING

Under Article 6 of the General Data Protection Regulation (GDPR) and equivalent international standards, Helpotron processes personal data only when an established legal basis applies.

| Legal Basis | Applicable Operations & Objectives |
| :--- | :--- |
| **1. Contractual Necessity (Art. 6(1)(b) GDPR)** | • Account Management & Authentication<br>• Study Material & Flashcard Generation<br>• Lecture Transcription Services<br>• Credit Ledger Tracking & Billing Operations |
| **2. Legitimate Interests (Art. 6(1)(f) GDPR)** | • Infrastructure Defense & Firewall Hardening<br>• Automated Brute-Force & Fraud Prevention<br>• Rate-Limiting & Bot Interception<br>• Host Performance Monitoring & Memory Optimization |
| **3. Explicit User Consent (Art. 6(1)(a) GDPR)** | • Research Data Lake Contributions (Data Discount Program)<br>• Personal Writing Sample Style Calibration<br>• Optional Telegram & Email Study Notifications<br>• Pedagogical Model Benchmarking Opt-In |

---

## 4. ARTIFICIAL INTELLIGENCE, LARGE LANGUAGE MODELS, AND AUTOMATED PROCESSING

Helpotron leverages cutting-edge artificial intelligence, machine learning architectures, and natural language processing pipelines. We are deeply committed to transparency, algorithmic integrity, and user agency regarding all automated processing workflows.

### 4.1 AI Model Architecture & Multi-Tier Execution Hierarchy
- **Tier 1 — High-Efficiency Foundation Models (e.g., Google Gemini 3.1 Flash-Lite, DeepSeek-V4-Flash)**: Deployed for high-frequency, low-latency generative tasks including active recall flashcard generation, 2-minute class prep digests, assignment classification, and structured slide outlines.
- **Tier 2 — Advanced Reasoning & Multimodal Specialists (e.g., Google Gemini 3.7 Flash, DeepSeek-Chat)**: Deployed for complex multi-page study guide structuring, pedagogical practice test creation with explanatory distractors, visual layout design logic, and presentation narrative synthesis.
- **Tier 3 — Neural Audio & Transcription Models (e.g., Local Faster-Whisper, Gemini 3.1 Flash-Lite Speech)**: Deployed to convert spoken classroom lectures, technical symposiums, and seminar recordings into formatted textual transcripts with timestamps and speaker tags.
- **Presentation Tasks (Pure-Gemini Routing)**: Presentation and slide assignments (`.pptx`, `.ppt`, `.gslides`, pitch decks) automatically bypass general LLM subagents and are routed exclusively to Google Gemini, with a user-configurable model ratio split (0–100%).

### 4.2 Data Handling by Third-Party AI Inference Providers
When queries, assignment text, or transcripts are submitted to third-party model inference APIs (including Google Cloud Vertex AI / Gemini API, DeepSeek AI, and OpenAI-compatible OmniRoute gateways):
- Data is transmitted exclusively over encrypted TLS 1.3 connections.
- We utilize commercial enterprise API tiers that enforce **Zero Data Retention for Training** by default. Your proprietary assignment prompts, lecture transcripts, and student essays are NOT used by model vendors to train, fine-tune, or improve public foundation models.
- Prompts and contextual transcripts are retained in transient memory solely for the duration required to complete the streaming inference request.

### 4.3 Automated Decision-Making and Student Rights (GDPR Article 22)
Helpotron does NOT make legal, academic, or disciplinary decisions regarding any student based solely on automated processing.
- The AI Detection scoring module in `server/draft.py` provides informational, heuristic estimates of text originality and AI likelihood. These scores are designed solely as diagnostic feedback for the student's self-evaluation.
- Helpotron's automated systems do not grade assignments, submit work to institutions, or communicate with instructors without explicit human agency.
- Users maintain the right to obtain human intervention, contest any automated feedback, and request manual administrative review of account restrictions.

### 4.4 The Helpotron Research Data Lake & Educational Model Development
- **Voluntary Opt-In**: Users may choose to contribute anonymized assignment prompts, study guides, and grading criteria to the Helpotron Research Data Lake in exchange for promotional billing credits (the Data Discount Program).
- **De-Identification & Anonymization Standards**: Prior to ingestion into the Data Lake, all submissions pass through an automated privacy sanitizer that strips student names, instructor names, institution names, email addresses, phone numbers, and unique identifiers.
- **Irreversibility**: Anonymized records within the Data Lake are permanently severed from the user's account ID and cannot be re-identified.

---

## 5. THIRD-PARTY SERVICE PROVIDERS AND SUBPROCESSORS

To operate our globally distributed cloud architecture, Helpotron engages vetted third-party subprocessors. Each subprocessor is bound by strict Data Processing Agreements (DPAs) and confidentiality obligations.

| Subprocessor | Purpose / Function | Location / Jurisdiction | Data Categories Processed | Security Safeguards |
| :--- | :--- | :--- | :--- | :--- |
| **Google Cloud Platform / Gemini API** | AI Model Inference, Transcription, Multimodal Processing | United States / Global | Anonymized prompts, transcripts, audio streams | ISO 27001, SOC 2 Type II, HIPAA compliant, TLS 1.3 |
| **DeepSeek AI / Moonshot AI** | Auxiliary Language Model Reasoning | Global / Regional Endpoints | Assignment prompts, study guide requests | Enterprise API DPA, Zero Data Retention Agreements |
| **Stripe, Inc.** | Payment Processing & Subscription Billing | United States / EU | Billing address, transaction amounts, payment tokens | PCI-DSS Level 1, SOC 1/2/3, Tokenized Vaults |
| **Telegram Messenger Inc.** | Optional Student Bot Notification Relay | Global | Chat IDs, notification alert text, summary snippets | MTProto Encryption, User-Configurable Disconnect |
| **VPS Hosting Infrastructure Provider** | Bare-metal VPS, Linux Host Virtualization, Storage | United States / EU Datacenters | Encrypted database files, uploads, application logs | SOC 2 Type II, Physical Datacenter Access Control |
| **Let's Encrypt (ISRG)** | Automated SSL/TLS Certificate Authority | United States | Domain DNS queries, server public keys | Automated ACME protocol, Public Transparency Logs |

---

## 6. DATA STORAGE, ENCRYPTION, AND SECURITY HARDENING

Helpotron maintains an enterprise-grade defense-in-depth security posture designed to safeguard student data against unauthorized access, exfiltration, alteration, and destruction.

### 6.1 Cryptographic Standards and Data Encryption
- **Data in Transit**: All traffic between student browsers, the Canvas extension, mobile devices, and our VPS servers is encrypted using Transport Layer Security (TLS 1.3 primary, TLS 1.2 fallback). We mandate Strict Transport Security (HSTS) with a minimum duration of two years (`max-age=63072000; includeSubDomains; preload`).
- **Data at Rest**: All database storage volumes, relational records, study material archives, and transaction ledgers are encrypted at rest using industry-standard AES-256 encryption.
- **Password Security**: Student passwords are never stored in plaintext. Passwords are cryptographically hashed using PBKDF2 with unique, cryptographically random 16-byte hexadecimal salts (`secrets.token_hex(16)`) and 100,000 SHA-256 iterations.

### 6.2 VPS Host Hardening & Infrastructure Protection
- **Network Firewall & Port Security**: The Linux host enforces Uncomplicated Firewall (UFW) rules that deny all incoming traffic by default, permitting only SSH (port 22), HTTP (port 80, redirected immediately to HTTPS), and HTTPS (port 443). The backend application server (uvicorn/gunicorn) binds exclusively to internal loopback `127.0.0.1:8000`, completely isolated from external network interfaces.
- **SSH Hardening**: Administrative access is restricted to authenticated Ed25519 public keys. Root login (`PermitRootLogin no`) and password-based authentication (`PasswordAuthentication no`) are globally disabled across all VPS nodes.
- **Intrusion Prevention & Rate Limiting**: Automated daemon fail2ban monitors connection logs, enforcing immediate IP-level bans upon repeated authentication failures. Application-layer adaptive rate limiters throttle login attempts with exponential backoff.
- **Principle of Least Privilege**: Application processes run under a dedicated, unprivileged system user (`helpotron`) without sudo or superuser capabilities.

### 6.3 Transient Storage of Audio Uploads
Uploaded audio files stored in the server's `uploads/` staging directory are processed asynchronously and purged automatically within 24 hours of successful transcript generation.

---

## 7. DATA RETENTION AND ACCOUNT LIFECYCLE POLICY

### 7.1 Retention Schedule
| Data Category | Active Account Retention | Inactive Account Retention | Post-Deletion Window |
| :--- | :--- | :--- | :--- |
| **User Account & Profile** | Duration of active subscription | 24 months from last login | Purged within 30 days of request |
| **Assignments & Prompts** | Retained until deleted by user | 24 months | Purged within 30 days of request |
| **Generated Study Guides & Flashcards** | Retained indefinitely for student revision | 24 months | Purged within 30 days of request |
| **Raw Lecture Audio Files** | Maximum 24 hours in staging cache | Purged immediately post-transcription | Immediate deletion |
| **Credit & Payment Transaction Logs** | 7 years (statutory tax/accounting rules) | 7 years | Retained in anonymized ledger format |
| **Technical Telemetry & Access Logs** | 90 days rolling buffer | 90 days | Automatic log rotation overwrite |

### 7.2 Account Inactivity and Automated Deprecation
Accounts with zero login activity for a consecutive period of twenty-four (24) months are flagged for deprecation. Helpotron will transmit an email notification thirty (30) days prior to deprecation. If no response or login occurs, all personal study materials, assignment histories, and transcripts will be permanently expunged.

---

## 8. USER RIGHTS AND DATA SUBJECT ACCESS MECHANISMS

Under the General Data Protection Regulation (GDPR Articles 15–22), the California Consumer Privacy Act / California Privacy Rights Act (CCPA/CPRA), and related privacy statutes, you possess comprehensive rights regarding your personal data:

- **Right to Access & Portability (GDPR Art. 15 & 20; CCPA § 1798.100)**: Instant downloads of flashcards in Quizlet/Anki CSV formats, practice tests in structured JSON, and study guides in clean Markdown via `/api/export/*`. Full comprehensive data archives delivered within 30 calendar days upon request to `dpo@helpotron.com`.
- **Right to Rectification (GDPR Art. 16)**: Update profile attributes, reading levels, or assignment data directly via the Settings modal or by contacting support.
- **Right to Erasure / Right to Be Forgotten (GDPR Art. 17; CCPA § 1798.105)**: Permanent cryptographic wipe of user records, assignments, transcripts, drafts, and study sessions across all active databases within 30 days.
- **Right to Restrict & Object to Processing (GDPR Art. 18 & 21)**: Restrict analytical telemetry or stylistic voice mimicry at any time.
- **Non-Discrimination**: Helpotron will never discriminate against, deny service to, or degrade the quality of service for any student who chooses to exercise their statutory privacy rights.

---

## 9. CHILDREN'S PRIVACY AND EDUCATIONAL DATA PROTECTION (COPPA & FERPA)

### 9.1 Children's Online Privacy Protection Act (COPPA) Compliance
Helpotron is designed for high school, undergraduate, and postgraduate students. Our services are NOT directed to children under the age of thirteen (13). We do not knowingly collect personal data from individuals under 13 years of age. If we discover that an account has been registered by a child under 13 without verified parental/institutional consent, we immediately terminate the account and purge all associated records.

### 9.2 Family Educational Rights and Privacy Act (FERPA) Alignment
When Helpotron is utilized in conjunction with school-issued Canvas LMS accounts or institutional agreements:
- Helpotron operates as a "School Official" with legitimate educational interests under 34 CFR § 99.31(a)(1)(i).
- All student education records extracted from Canvas remain under the direct control and ownership of the student and their educational institution.
- Helpotron does not redisclose, monetize, or use student educational records for commercial behavioral advertising.

---

## 10. INTERNATIONAL DATA TRANSFERS

Helpotron operates server infrastructure located primarily in the United States and the European Economic Area (EEA). To safeguard cross-border transfers from the EEA and UK to the United States, Helpotron relies on:
- **Standard Contractual Clauses (SCCs)**: Incorporating European Commission approved Standard Contractual Clauses (Commission Implementing Decision (EU) 2021/914) into all subprocessor agreements.
- **Supplementary Technical Safeguards**: Implementing end-to-end transport encryption (TLS 1.3), database field-level encryption, and strict anonymization filters before transfer.

---

## 11. DATA BREACH NOTIFICATION PROTOCOL

In the event of a confirmed security incident or data breach compromising personal student data:
1. **Investigation & Containment (0–12 Hours)**: Node isolation, system secret rotation, and forensic investigation.
2. **Regulatory Disclosure (Within 72 Hours)**: Notification of competent supervisory authorities (EU Data Protection Authorities and US State Attorneys General) in accordance with Article 33 of the GDPR.
3. **User Notification**: Direct email notifications and prominent in-app dashboard banners detailing breach nature, impacted data categories, and user protection steps.

---

## 12. POLICY MODIFICATIONS AND NOTIFICATION MECHANISMS

Helpotron reserves the right to revise this Privacy Policy periodically. When material modifications are enacted, we update the "Last Updated" date, broadcast an in-app modal notification across the student dashboard, and transmit an email digest at least fourteen (14) days prior to the effective date.

---

## 13. DATA PROTECTION OFFICER & CONTACT INFORMATION

**Helpotron Automator Systems Inc.**  
*Office of the Data Protection Officer (DPO)*  
- **DPO Inquiries & Rights Requests:** `dpo@helpotron.com`  
- **Security Operations & Disclosures:** `security@helpotron.com`  
- **Legal Compliance:** `compliance@helpotron.com`  
- **General Support:** `support@helpotron.com`  
- **Official Domain:** `https://helpotron.com`

---

## 14. US STATE-SPECIFIC PRIVACY RIGHTS AND STATUTORY ADDENDA

### 14.1 California Consumer Privacy Act (CCPA) and California Privacy Rights Act (CPRA)
- **Notice of Collection**: In the preceding 12 months, Helpotron collected Identifiers (Category A), Customer Records (Category B), Commercial Information (Category D), Internet Activity (Category F), Audio Information (Category H), and Non-Public Education Information (Category J).
- **No Selling or Sharing**: Helpotron does NOT sell personal information and does NOT share personal information for cross-context behavioral advertising.
- **Shine the Light (Cal. Civ. Code § 1798.83)**: Helpotron does not disclose personal data to third parties for direct marketing.

### 14.2 Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), and Florida (FDBR)
Eligible residents may submit requests to confirm processing, access, correct, delete, or obtain portable copies of their personal data, or appeal rights determinations by emailing `dpo@helpotron.com` with subject `PRIVACY APPEAL`.

---

## 15. DETAILED COOKIE, TRACKING, AND LOCAL STORAGE GOVERNANCE

### 15.1 Comprehensive Cookie Ledger
| Cookie Identifier | Purpose / Category | Lifecycle / Duration | Security Flags Applied |
| :--- | :--- | :--- | :--- |
| `helpotron_session` | Authenticated session token; binds client to user ID | 7 Days (Rolling Refresh) | `HttpOnly=True`, `Secure=True` (Prod), `SameSite=Strict`, `Path=/` |
| `csrf_token` | Double-submit CSRF prevention token | Session / Browser Close | `HttpOnly=False` (JS Readable), `Secure=True` (Prod), `SameSite=Lax` |
| `theme_preference` | Stores visual preference (Dark/Light mode) | 365 Days | `HttpOnly=False`, `Secure=False`, `SameSite=Lax` |

### 15.2 Client-Side Local Storage Objects (`localStorage`)
- `helpotron_server`: Active backend API origin URL (e.g. `https://helpotron.com`).
- `helpotron_public_id`: Student public username pseudonym for UI state persistence.
- `helpotron_reading_level`: Cached academic reading level.
- `helpotron_theme`: Selected visual theme token (dark or light mode).

### 15.3 Global Privacy Control (GPC) & Do Not Track (DNT)
Helpotron honors browser Global Privacy Control (GPC) signals and Do Not Track (DNT) headers.

---

## 16. EDUCATIONAL INSTITUTION DATA PROTECTION AGREEMENT (FERPA ADDENDUM)

When utilized by educational agencies, universities, colleges, or K-12 school districts:
- **Designation as School Official**: Helpotron is designated as a School Official with legitimate educational interests pursuant to 34 CFR § 99.31(a)(1)(i).
- **Direct Control & Non-Redisclosure**: All student records remain under institutional ownership and will not be redisclosed or monetized.
- **Data Return & Destruction**: Records returned or cryptographically destroyed within sixty (60) days of agreement termination.

---

## 17. TECHNICAL SECURITY SPECIFICATION AND INCIDENT PROTOCOLS

- **Kernel & Network Hardening**: Linux sysctl network hardening (`tcp_syncookies = 1`, `accept_redirects = 0`), UFW stateful filtering exposing only ports 22, 80, 443; internal loopback binding for API (`127.0.0.1:8000`).
- **Nginx Reverse Proxy & DDoS Mitigation**: HTTP/2 multiplexing, dual-tier rate limiting zones (`api_limit` at 30 req/s, `auth_limit` at 5 req/s), 50MB body size cap.
- **Automated Patching**: Unattended security upgrades (`unattended-upgrades`) applying CVE patches within 24 hours.

---

## 18. ACCESSIBILITY, EQUAL ACCESS, AND NON-DISCRIMINATION POLICY

Helpotron adheres to Section 508 of the Rehabilitation Act, Title III of the ADA, and Web Content Accessibility Guidelines (**WCAG 2.1 Level AA**):
- **Perceivable**: High-contrast ratios ($\ge 4.5:1$ normal text, $\ge 3:1$ large text/UI elements) in dark and light palettes, descriptive `aria-label` tags.
- **Operable**: Complete keyboard accessibility (`Tab`, `Enter`, `Space`, `Escape`), focus-trapped dialogs, zero keyboard traps.
- **Understandable & Robust**: Plain language system notices, live announcements (`aria-live="polite"`), semantic HTML5 structure.

Accessibility Coordinator Contact: `accessibility@helpotron.com`.

---

## 19. FINAL LEGAL DISCLOSURES AND SUPREMACY

- **Entire Agreement**: This Privacy Policy, together with the Terms of Service, constitutes the entire data governance agreement between the user and Helpotron Automator Systems Inc.
- **Dispute Resolution & Governing Law**: Governed by the laws of the State of Florida, United States, or competent EU supervisory tribunals where mandated by GDPR Article 79.

---
*Authoritative Document Reference: `PRIVACY_POLICY_2026_V4_MONOLITHIC.MD`*  
*Helpotron Automator Systems Inc. · Office of the Data Protection Officer*

# Changelog

All notable changes to this project will be documented in this file.

## [v2.4.0] — 2026-08-17

### Security
- **CRITICAL**: Removed `X-Public-ID` header auth bypass — all admin actions now require a valid authenticated session with `is_admin` privileges.
- Fixed CSRF exemption list to no longer blanket-exempt authentication endpoints.
- Sessions are now persisted in the database (`UserSession` model) rather than in-memory only, surviving restarts.
- Secure flag and HttpOnly enforced on session cookies in production (`PRODUCTION_MODE=true`).

### Payments & Billing
- Implemented real Stripe Checkout Sessions with price IDs for Basic ($10/mo), Pro ($20/mo), Elite ($40/mo).
- Webhook endpoint (`/api/webhook/stripe`) handles subscription lifecycle events (`invoice.payment_succeeded`, `customer.subscription.deleted`).
- Added annual billing option (save ~17%) with dedicated price IDs.
- Added 30-day money-back guarantee messaging and price-anchoring against Chegg/Course Hero.
- Student discount support (email .edu verification in support).
- Referral reward increased to 600 credits for referrer, 60 for referee.
- Overage credits billing via Stripe Checkout (`handleTopUp`).
- Credit transaction history surfaced in the Billing tab.

### Database
- Added `UserSession` table for persistent, revocable server sessions.
- Added `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `is_student_verified`, `last_active_at` columns to the `users` table.
- Migrations generated in `alembic_migrations/`.

### Pricing Model
- Switched to a pure credit-based subscription model: all features are accessible to all users regardless of tier — plans only differ by monthly credit allocation (Basic: 300, Pro: 600, Elite: 1,500).
- Free-tier credit allocation implemented (no paid plan required to try core tools).

### UX / Frontend
- Credit balance prominently displayed in the Navbar HUD.
- Credit cost estimator badges on every Study Tools button.
- Low-credit warning banner (<10% of monthly allocation) and out-of-credits upsell prompt.
- Study Tools Hub no longer loads hardcoded demo data — all views start empty and require active user generation.
- PWA manifest added (`web/manifest.json`) for installability.
- Accessibility improvements: skip link, `:focus-visible` outlines, `prefers-reduced-motion` media query, high-contrast mode media query.
- Annual/monthly billing toggle in the Credits Pricing Dashboard.

### Infrastructure
- Added `Dockerfile` for reproducible server builds.
- Added GitHub Actions CI/CD workflow (`.github/workflows/deploy.yml`): runs tests on push, builds & pushes Docker image on tag.
- Added automated database backup script (`scripts/backup_db.sh`) with retention.
- Added nginx WebSocket proxy configuration (`/ws/`) for real-time agent sessions.
- Health check endpoint (`/health`) with database connectivity verification.

### Developer Experience
- `.env.example` updated with all required Stripe price IDs and configuration defaults.
- Structured logging initialized (structured log output, ready for Sentry integration).

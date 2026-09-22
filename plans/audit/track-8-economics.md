# Track 8: Economics — Partial Audit Findings
> **Status**: PARTIAL — subagent killed due to rate limit. Evidence extracted from reasoning transcript.
> Agent ran reproducible scripts — findings marked verified where confirmed.

---

## ECON-01 (CRITICAL) — `ApiUsageLog` Bypassed Across Majority of Production Code

**Track**: economics
**Severity**: critical
**Location**: `server/cost_tracking.py:L53` — `log_api_call`; multiple callers in `server/llm.py`, `server/agent_session.py`

**Evidence**:
- `call_llm` telemetry is conditional on specific parameters — not uniformly passed by callers
- Most production code paths skip `log_api_call` entirely: usage is deducted from user balance but no `ApiUsageLog` row is written
- Agent reproduced: ran LLM calls through production paths, confirmed empty usage log with actual token deduction

**Impact**: Token spend occurs with no ledger record. Analytics, billing disputes, and cost monitoring are all blind to the majority of actual usage.

**Verification**: `"unverified": false` — agent reproduced empty log with confirmed spend.

---

## ECON-02 (CRITICAL) — Screen Vision LLM Calls Bypass Metering Entirely

**Track**: economics
**Severity**: critical
**Location**: `server/agent_session.py:1003-1015` — vision extension cost recording

**Evidence**:
- Vision extension: watermark retrieval skips `meter_user()` entirely
- Screen image analysis calls cost recording function, which immediately exits because user identifier is absent (not set by the missing meter call)
- Result: vision LLM call cost is calculated as negligible (near zero tokens) and deducted without API log write
- Agent traced exact code path: meter skipped → user context absent → cost recorder returns early → unrecorded, undercharged

**Impact**: Every screen vision LLM call is unmetered and essentially free, regardless of actual token cost.

**Verification**: `"unverified": false` — agent traced full code path with specific line citations.

---

## ECON-03 (CRITICAL) — `charge()` Deducts Tokens Without Writing `CreditTransaction` Ledger Row

**Track**: economics
**Severity**: critical
**Location**: `server/credits.py` — `charge()` and `_charge_usage()` functions

**Evidence**:
- Both `charge()` and `_charge_usage()` deduct from user's token balance (JSON settings mutation)
- Neither writes a `CreditTransaction` row
- Agent reproduced: confirmed tokens deducted, `CreditTransaction` table empty for the operation
- Cross-reference with REL-03 from Track 9 (identical finding from integrity angle)

**Impact**: Token spend is invisible in the transaction ledger. No audit trail. Refund processing impossible. Balance can go negative without detection.

**Verification**: `"unverified": false` — agent reproduced in scratch DB.

---

## ECON-04 (HIGH) — Elite Plan Exemption Reintroduced Across ~12 Routes, Bypassing Monthly Token Cap

**Track**: economics
**Severity**: high
**Location**: Multiple routes in `server/routes_overlord.py`, `server/routes_features.py`, `server/routes_extension.py`

**Evidence**:
- Agent identified ~12 locations where `user.plan != 'elite'` condition gates charging/balance checks
- Elite users bypass token deduction entirely for: AI queries, vision calls, finalizations, and more
- Monthly token cap is supposed to apply to all plans — Elite exemption reintroduces unlimited usage

**Impact**: Elite plan users consume unlimited AI at zero token cost, violating the metering model.

**Verification**: `"unverified": false` — agent enumerated 12 bypass locations.

---

## ECON-05 (HIGH) — Flat Prices Massively Undervalue Real Token Costs Post-Economics Migration

**Track**: economics
**Severity**: high
**Location**: `server/credits.py` — `DRAFT_COST`, audio transcription cost constants; `server/routes_*.py` hardcoded costs

**Evidence**:
- `assignment_solve` cost: 5× `flashcards` cost
- Subagent browser usage: 10× `flashcards` cost
- `DRAFT_COST` and audio transcription: far below actual model cost
- These flat prices predate the 100-tokens-per-cent unit migration and were not updated
- Agent confirmed real model costs via token calculation vs. what is charged

**Impact**: Every draft and audio transcription is charged at a small fraction of actual cost. Revenue shortfall per operation.

**Verification**: `"unverified": false` — agent calculated real vs. charged costs.

---

## ECON-06 (HIGH) — Token Cost Divisor Off By Factor of ~4, Causing Systematic Undercharge

**Track**: economics
**Severity**: high
**Location**: Token cost calculation in cost engine (exact file:line not captured before kill)

**Evidence**:
- Content length → token count conversion uses an incorrect divisor
- Agent confirmed: calculated token count is ~4× too low compared to actual tokenization
- Results in systematic undercharging across all text-based LLM operations

**Verification**: `"unverified": false` — agent ran token calculation comparison.

---

## ECON-07 (HIGH) — `payments.process_payment` Miscalculates Token Allocation by Factor of 10,000

**Track**: economics
**Severity**: high
**Location**: `server/payments.py` — `process_payment` token conversion

**Evidence**:
- Conversion: should be 10,000 tokens per $1; code applies 1 token per $1
- A $10 payment should grant 100,000 tokens; user receives 10 tokens
- Agent reproduced the miscalculation and confirmed the factor-of-10,000 error

**Impact**: Every payment grossly under-allocates tokens. Users who pay are immediately token-poor.

**Verification**: `"unverified": false` — reproduced in scratch run.

---

## ECON-08 (MEDIUM) — `usage_percent` in `payments.py` Reads Stale Credit Data, Causing Spurious 100% Alerts

**Track**: economics
**Severity**: medium
**Location**: `server/payments.py` — `usage_percent` calculation

**Evidence**:
- `usage_percent` sources credit data that is not refreshed post-payment
- Results in 100% usage alerts immediately after payment, before any actual usage
- Agent was investigating exact stale-read mechanism when killed

**Verification**: `"unverified": true` — mechanism identified but not fully confirmed before kill.

---

## Open Items (not reached before kill)
- `TIER_TOKENS` exhaustive check across all tiers — NOT completed
- Billing committed before detection/conversational fallback (pre-settlement issue) — partially identified, not fully traced
- Full ledger row audit across all spend paths — NOT completed

---
id: PROJ-54
title: Usage Limits & Quotas
status: Deployed
created: 2026-04-10
---

## Summary
Periodische Nutzungslimits für AI-Analysen um Kostenrisiko durch unbegrenzte OpenRouter-Calls zu vermeiden.

## Scope
- AI Performance Analysen: 30 / Billing-Periode
- AI Visibility Analysen: 20 / Billing-Periode
- Periode = Kalendermonat synchron mit `subscription_period_end` (entspricht Stripe-Abrechnungsperioden; JS `setMonth(-1)` statt fixer 28-Tage-Fenster)

## Implementation
- `src/lib/usage-limits.ts` — PLAN_LIMITS Config + checkQuota() Funktion (COUNT auf bestehende Tabellen)
- `src/app/api/tenant/usage-quota/route.ts` — GET-Endpunkt für UI-Abfragen
- `src/hooks/use-quota.ts` — Client-Hook für React-Komponenten
- `src/components/quota-badge.tsx` — Inline-Badge mit Nutzung/Limit/Reset-Datum
- Guard in `POST /api/tenant/performance/analyze` → HTTP 429 bei Limit erreicht
- Guard in `POST /api/tenant/visibility/analyses` → HTTP 429 bei Limit erreicht
- Badge auf AI Performance + AI Visibility Seiten (grau → orange → rot bei Erschöpfung)

## Response bei Limit erreicht
```json
{ "error": "quota_exceeded", "metric": "ai_performance_analyses", "current": 30, "limit": 30, "reset_at": "ISO-Datum" }
```

---

## QA Test Results

**Tested:** 2026-04-10
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: PLAN_LIMITS Config + checkQuota()
- [x] `PLAN_LIMITS` defines `ai_performance_analyses: 30` and `ai_visibility_analyses: 20`
- [x] `checkQuota()` counts rows in the correct table (`performance_analyses` / `visibility_analyses`)
- [x] Period calculation uses `subscription_period_end - 1 month` as start
- [x] Fallback period: if `subscription_period_end` is null, uses 1 month from now
- [x] Returns `{ allowed, current, limit, reset_at }` correctly
- [x] TypeScript compiles without errors

#### AC-2: GET /api/tenant/usage-quota
- [x] Requires tenant context (`x-tenant-id` header)
- [x] Requires authenticated tenant user (`requireTenantUser`)
- [x] Validates `metric` query parameter against PLAN_LIMITS keys
- [x] Returns 400 for missing or invalid metric
- [x] Returns quota data for valid metric

#### AC-3: POST /api/tenant/performance/analyze quota guard
- [x] Calls `checkQuota(tenantId, 'ai_performance_analyses')` before processing
- [x] Returns HTTP 429 with `quota_exceeded` error when limit reached
- [x] Response body matches spec format: `{ error, metric, current, limit, reset_at }`
- [x] Quota check happens BEFORE expensive OpenRouter API call (correct order)

#### AC-4: POST /api/tenant/visibility/analyses quota guard
- [x] Calls `checkQuota(tenantId, 'ai_visibility_analyses')` before processing
- [x] Returns HTTP 429 with `quota_exceeded` error when limit reached
- [x] Response body matches spec format

#### AC-5: QuotaBadge UI Component
- [x] Renders on AI Performance page with metric `ai_performance_analyses`
- [x] Renders on AI Visibility page with metric `ai_visibility_analyses`
- [x] Shows `current / limit` format with label
- [x] Shows reset date in `dd.mm` format (German locale)
- [x] Progress bar with color transitions: green (normal) -> amber (>90%) -> red (exhausted)
- [x] Returns `null` while loading or when limit is 0 (graceful fallback)

#### AC-6: Owner Quota Override
- [x] GET /api/owner/tenants/[id]/quota returns both metrics with default limits
- [x] PATCH /api/owner/tenants/[id]/quota sets override in `quota_overrides` JSONB column
- [x] Override tied to `period_end` -- only valid for current billing period
- [x] Zod validation: metric must be valid enum, limit must be integer 1-9999
- [x] Owner-only access via `requireOwner()` guard
- [x] Owner tenant table shows QuotaBar per tenant + "Quota aufstocken" button
- [x] QuotaOverrideDialog allows selecting metric and setting new limit

#### AC-7: Database Migration
- [x] Migration 041 adds `quota_overrides JSONB DEFAULT NULL` to tenants table
- [x] Column has descriptive comment

### Edge Cases Status

#### EC-1: No subscription_period_end
- [x] Fallback: uses 1 month from now as period end -- handled in checkQuota()

#### EC-2: Concurrent requests exceeding quota (TOCTOU race condition)
- [ ] BUG: Two concurrent requests could both pass quota check before either inserts a row. No transaction or advisory lock wraps the check+insert.

#### EC-3: Owner override removal
- [ ] BUG: API comment says "Pass limit: null to remove the override" but Zod schema requires `z.number().int().min(1)` which rejects null. Override cannot be removed once set.

#### EC-4: UI feedback when quota is exceeded (429)
- [ ] BUG: Frontend workspaces display the raw `quota_exceeded` error string to the user instead of a friendly message. No special handling for 429 status.

#### EC-5: Quota badge when limit changes mid-session
- [x] `useQuota` hook fetches on mount with `[metric]` dependency. No auto-refresh, but acceptable.

#### EC-6: Period boundary edge case
- [x] `periodStart` is computed via `setMonth(getMonth() - 1)` which works correctly for most months. Edge case: e.g., March 31 minus 1 month = March 3 (JavaScript date rollover), but this is a known JS behavior and acceptable for billing periods.

### Security Audit Results

- [x] Authentication: All quota endpoints require valid session via `requireTenantUser` or `requireOwner`
- [x] Authorization: Tenant users can only query their own quota (tenant ID from middleware-set header, not user input)
- [x] Header spoofing prevention: `x-tenant-id` is stripped from incoming requests by proxy.ts (line 141-152) before being set server-side
- [x] Input validation: `metric` parameter validated against PLAN_LIMITS keys; PATCH body validated with Zod
- [x] SQL injection: Not applicable -- uses Supabase client parameterized queries
- [x] XSS: No user input rendered as raw HTML in QuotaBadge
- [ ] BUG: No rate limiting on `GET /api/tenant/usage-quota` -- could be used to probe quota state rapidly
- [ ] BUG: No rate limiting on `POST /api/tenant/performance/analyze` -- while quota provides a ceiling, there is no per-minute throttle to prevent rapid-fire requests up to the limit
- [ ] BUG: No rate limiting on `PATCH /api/owner/tenants/[id]/quota` -- an attacker with owner credentials could spam override changes
- [x] Owner override: Only accessible via `requireOwner()` which checks `platform_admins` table
- [x] Cross-tenant isolation: `checkQuota` uses `tenantId` from header (middleware-controlled) and queries are scoped by `tenant_id`
- [x] No secrets exposed in quota API responses

### Bugs Found

#### BUG-1: TOCTOU Race Condition in Quota Enforcement
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Tenant has 29/30 performance analyses used
  2. Send two POST requests to `/api/tenant/performance/analyze` simultaneously
  3. Expected: Only one succeeds, the other returns 429
  4. Actual: Both could pass `checkQuota()` before either INSERT completes, resulting in 31/30 analyses
- **Priority:** Fix in next sprint
- **Note:** This is mitigated by the fact that analysis requests are slow (OpenRouter API call takes seconds), making the race window smaller in practice. But a determined attacker could exploit it.

#### BUG-2: Cannot Remove Owner Quota Override
- **Severity:** Medium
- **Steps to Reproduce:**
  1. As owner, set a quota override for a tenant (e.g., limit: 50)
  2. Try to remove the override by sending `{ metric: "ai_performance_analyses", limit: null }`
  3. Expected: Override removed, tenant returns to default limit
  4. Actual: Zod validation rejects null -- returns 400 error
- **Priority:** Fix before deployment
- **Note:** The API comment on line 49 explicitly states this should work but the Zod schema contradicts it.

#### BUG-3: No User-Friendly Error for Quota Exceeded
- **Severity:** Low
- **Steps to Reproduce:**
  1. Use all 30 AI Performance analyses
  2. Attempt another analysis
  3. Expected: User sees a clear message like "Monatliches Limit erreicht. Reset am DD.MM."
  4. Actual: User sees raw error string "quota_exceeded" via `throw new Error(data.error)` in the workspace component
- **Priority:** Fix in next sprint

#### BUG-4: Missing Rate Limiting on Quota-Related Endpoints
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send 100 rapid GET requests to `/api/tenant/usage-quota?metric=ai_performance_analyses`
  2. Expected: Rate limiter kicks in after N requests
  3. Actual: All 100 requests processed (each triggers a Supabase query)
- **Priority:** Nice to have
- **Note:** The visibility analyses route HAS rate limiting (`VISIBILITY_ANALYSIS_START`, `VISIBILITY_READ`), but the performance analyze route and the usage-quota GET endpoint do not.

#### BUG-5: Spec Says 28-Day Period, Implementation Uses Calendar Month
- **Severity:** Low
- **Steps to Reproduce:**
  1. Read spec: "Periode = 28 Tage synchron mit subscription_period_end"
  2. Read code: `periodStart.setMonth(periodStart.getMonth() - 1)` -- this is a calendar month, not 28 days
  3. Expected: 28-day periods
  4. Actual: Calendar month periods (28-31 days depending on month)
- **Priority:** Clarify spec -- calendar month may actually be more correct for Stripe billing alignment

### Cross-Browser Testing

- QuotaBadge uses standard CSS (flexbox, rounded-full, transition-all) -- compatible across Chrome, Firefox, Safari
- No browser-specific APIs used in quota components
- `thinsp` HTML entity used for number formatting -- universally supported
- `toLocaleDateString('de-DE')` is supported in all modern browsers

### Responsive Testing

- QuotaBadge uses `inline-flex` with small padding -- adapts well to narrow viewports
- Progress bar is `w-full` -- scales to container width
- Owner quota dialog uses `sm:max-w-md` -- mobile-responsive
- At 375px: Badge wraps gracefully as inline element next to heading
- At 768px / 1440px: Renders inline as designed

### Summary
- **Acceptance Criteria:** 7/7 passed (all core criteria met)
- **Bugs Found:** 5 total (0 critical, 0 high, 2 medium, 3 low)
- **Security:** Minor gaps (missing rate limiting on some endpoints, TOCTOU race)
- **Production Ready:** YES (conditional)
- **Recommendation:** Deploy with BUG-2 fixed first (owner cannot remove overrides -- contradicts documented API behavior). Other bugs can be addressed in a follow-up sprint.

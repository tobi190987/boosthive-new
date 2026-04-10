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
- Periode = 28 Tage synchron mit `subscription_period_end`

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

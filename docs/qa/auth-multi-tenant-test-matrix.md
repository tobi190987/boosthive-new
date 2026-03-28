# Auth & Multi-Tenant Test-Matrix

Ziel: Die wichtigsten Kombinationen aus Tenant, Rolle und Flow kompakt abdecken.

## Testobjekte

- Tenant A: mit Agenturlogo
- Tenant B: ohne Agenturlogo
- Rollen: Admin, Member
- Statusvarianten: aktiv, deaktiviert, ungültiger Link, abgelaufener Link

## Matrix

| Bereich | Tenant A Admin | Tenant A Member | Tenant B Admin | Ohne Login |
| --- | --- | --- | --- | --- |
| Login | Muss funktionieren | Muss funktionieren | Muss funktionieren | Nicht anwendbar |
| Logout | Muss funktionieren | Muss funktionieren | Muss funktionieren | Nicht anwendbar |
| Dashboard-Zugriff | Erlaubt | Erlaubt | Erlaubt | Muss auf Login umleiten |
| Profil-Seite | Erlaubt | Erlaubt | Erlaubt | Muss auf Login umleiten |
| Onboarding | Mit Rechnungsdaten + Stripe-Hinweis | Ohne Admin-Billing | Mit Rechnungsdaten + Stripe-Hinweis | Nicht erreichbar |
| Rechnungsdaten | Pflichtfelder sichtbar | Nicht sichtbar | Pflichtfelder sichtbar | Nicht erreichbar |
| Land-Dropdown | Nur Deutschland | Nicht sichtbar | Nur Deutschland | Nicht erreichbar |
| Passwort vergessen | Tenant-gebunden | Tenant-gebunden | Tenant-gebunden | Öffentlich erreichbar |
| Reset Password | Branding korrekt | Branding korrekt | Branding korrekt | Nur mit gültigem Link sinnvoll |
| Invite annehmen | Muss tenant-gebunden bleiben | Muss tenant-gebunden bleiben | Muss tenant-gebunden bleiben | Öffentlich erreichbar |
| Auth-Branding | Logo von Tenant A | Logo von Tenant A | Fallback oder Tenant-B-Branding | Tenant-spezifisch je Host |
| Admin-only Bereiche | Erlaubt | Verboten | Erlaubt | Verboten |

## Priorität

### P0

- [ ] Tenant A Admin: Login, Onboarding, Dashboard, Logout
- [ ] Tenant A Admin: Forgot Password und Reset
- [ ] Tenant A Admin: Invite-Link prüfen
- [ ] Tenant-Isolation zwischen Tenant A und Tenant B
- [ ] Geschützte Seiten ohne Login

### P1

- [ ] Tenant A Member: Login, Dashboard, Logout
- [ ] Tenant A Member: Kein Zugriff auf Admin-only Bereiche
- [ ] Tenant B Admin: Branding-Fallback und Login
- [ ] Auth-Seiten mobil und desktop

### P2

- [ ] Manipulierte Reset-Links
- [ ] Ungültige Invite-Links
- [ ] Deaktivierter Tenant
- [ ] Browser-Zurück nach Logout

## Abdeckungshinweis

Wenn wenig Zeit da ist, zuerst alle `P0`-Fälle testen. Wenn diese sauber sind, danach `P1`, zuletzt `P2`.

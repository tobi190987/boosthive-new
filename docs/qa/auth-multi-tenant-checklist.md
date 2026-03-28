# Auth & Multi-Tenant QA Checkliste

Ziel: Login, Onboarding, Passwort-Reset und Multi-Tenant-Verhalten systematisch durchtesten.

Aktueller Scope:
- Login
- Onboarding
- Passwort vergessen / Reset
- Einladungen
- Tenant-Isolation
- Auth-Branding

Nicht im Scope:
- Stripe-Abschluss und Billing-Aktivierung

## Testdaten

- [ ] Tenant A existiert und hat ein Agenturlogo.
- [ ] Tenant B existiert und hat kein Agenturlogo.
- [ ] Für Tenant A gibt es einen Admin-User.
- [ ] Für Tenant A gibt es einen Member-User.
- [ ] Für Tenant B gibt es einen Admin-User.
- [ ] Es gibt einen ungültigen Invite-Link.
- [ ] Es gibt einen abgelaufenen oder manipulierten Reset-Link.
- [ ] Es gibt einen deaktivierten Tenant für Negativtests.

## 1. Tenant Routing

- [ ] `tenant-a` aufrufen.
  Erwartet: Tenant-A-Branding wird angezeigt.
- [ ] `tenant-b` aufrufen.
  Erwartet: Kein Tenant-A-Branding sichtbar, stattdessen Fallback oder korrektes Tenant-B-Branding.
- [ ] Root-Domain aufrufen.
  Erwartet: Keine tenant-spezifischen Daten oder Logos werden geleakt.
- [ ] `/login`, `/forgot-password`, `/reset-password` und `/accept-invite` auf Tenant A direkt öffnen.
  Erwartet: Richtige Tenant-Zuordnung, korrektes Logo, korrekte Links.
- [ ] Dieselben Seiten auf Tenant B direkt öffnen.
  Erwartet: Kein falsches Branding, saubere Fallback-Anzeige.

## 2. Login

- [ ] Admin von Tenant A mit korrekten Zugangsdaten anmelden.
  Erwartet: Login erfolgreich, Redirect korrekt, Dashboard von Tenant A sichtbar.
- [ ] Member von Tenant A mit korrekten Zugangsdaten anmelden.
  Erwartet: Login erfolgreich, keine Admin-only Inhalte sichtbar.
- [ ] Falsches Passwort für Tenant-A-User eingeben.
  Erwartet: Saubere Fehlermeldung, kein Absturz, kein Redirect.
- [ ] Tenant-A-User auf Tenant B einloggen.
  Erwartet: Kein erfolgreicher Login in den falschen Tenant.
- [ ] Logout ausführen.
  Erwartet: Sitzung beendet, geschützte Seiten nicht mehr direkt nutzbar.

## 3. Onboarding

- [ ] Neuer Admin meldet sich erstmals an.
  Erwartet: Onboarding erscheint.
- [ ] Vorname und Nachname leer lassen.
  Erwartet: Abschluss nicht möglich, passende Validierung sichtbar.
- [ ] Rechnungsdaten leer lassen.
  Erwartet: Admin-Onboarding kann nicht abgeschlossen werden.
- [ ] Pflichtfeld-Markierung im Rechnungsbereich prüfen.
  Erwartet: Pflichtfelder sind klar markiert.
- [ ] Feld `Land` im Rechnungsbereich prüfen.
  Erwartet: Dropdown statt Freitext, aktuell nur `Deutschland` auswählbar.
- [ ] Onboarding mit gültigen Pflichtdaten abschließen.
  Erwartet: Redirect ins Dashboard, Onboarding erscheint danach nicht erneut.
- [ ] Member-Onboarding prüfen.
  Erwartet: Keine Admin-Rechnungsfelder sichtbar.

## 4. Branding auf Auth-Seiten

- [ ] Auf Tenant A `Login`, `Forgot Password`, `Reset Password` und `Accept Invite` öffnen.
  Erwartet: Auf allen Seiten wird das Agenturbild von Tenant A angezeigt.
- [ ] Auf Tenant B dieselben Seiten öffnen.
  Erwartet: Kein falsches Logo, stattdessen konsistenter Fallback.
- [ ] Tenant-Logo ändern und Auth-Seiten erneut laden.
  Erwartet: Aktualisiertes Logo wird angezeigt.

## 5. Passwort vergessen / Reset

- [ ] Auf `Forgot Password` mit existierender E-Mail anfragen.
  Erwartet: Neutrale Erfolgsmeldung, kein Account-Leak.
- [ ] Auf `Forgot Password` mit nicht existierender E-Mail anfragen.
  Erwartet: Dieselbe neutrale Erfolgsmeldung.
- [ ] Reset-Link auf dem korrekten Tenant öffnen.
  Erwartet: Reset-Seite lädt, Branding korrekt, Flow funktioniert.
- [ ] Neues Passwort setzen.
  Erwartet: Passwort wird aktualisiert, Login mit neuem Passwort ist möglich.
- [ ] Abgelaufenen oder manipulierten Reset-Link öffnen.
  Erwartet: Verständliche Fehlermeldung, kein Whitescreen.
- [ ] Reset-Link auf falschem Tenant öffnen.
  Erwartet: Flow schlägt sauber fehl oder wird verständlich abgefangen.

## 6. Einladungen

- [ ] Gültigen Invite-Link öffnen.
  Erwartet: Richtiger Tenant, korrektes Branding, Flow funktioniert.
- [ ] Einladung abschließen und Passwort setzen.
  Erwartet: Zugang wird aktiviert, anschließender Login ist möglich.
- [ ] Invite ohne Token oder mit ungültigem Token öffnen.
  Erwartet: Saubere Fehlermeldung.
- [ ] Invite von Tenant A auf Tenant B öffnen.
  Erwartet: Kein tenant-fremder Zugang möglich.

## 7. Zugriffsschutz

- [ ] `/dashboard` ohne Login aufrufen.
  Erwartet: Redirect auf Login.
- [ ] `/settings/profile` ohne Login aufrufen.
  Erwartet: Redirect auf Login.
- [ ] Member versucht Admin-only Bereich zu öffnen.
  Erwartet: Zugriff wird blockiert.
- [ ] Nach Logout Browser-Zurück testen.
  Erwartet: Geschützte Inhalte sind nicht mehr nutzbar.

## 8. Tenant-Isolation

- [ ] In Tenant A einloggen und Oberfläche prüfen.
  Erwartet: Keine Daten, Namen, Links oder Logos von Tenant B sichtbar.
- [ ] Passwort-Reset-Links und Invite-Links prüfen.
  Erwartet: Sie bleiben am richtigen Tenant gebunden.
- [ ] Zwischen Tenant A und Tenant B wechseln.
  Erwartet: Keine Vermischung von Session oder Branding.

## 9. Regression-Schnellcheck

- [ ] Auth-Seiten in mobiler Ansicht prüfen.
  Erwartet: Layout stabil, Logo sichtbar, keine Überläufe.
- [ ] Auth-Seiten in Desktop-Ansicht prüfen.
  Erwartet: Kein Layoutbruch.
- [ ] Fehlermeldungen und UI-Texte prüfen.
  Erwartet: Umlaute korrekt, keine kaputten Texte wie `vollstaendige`.

## Ergebnis

- [ ] Alle kritischen Kernflows bestanden.
- [ ] Gefundene Fehler dokumentiert.
- [ ] Entscheidungen für nächste Automatisierung festgehalten.

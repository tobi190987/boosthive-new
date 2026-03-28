# PROJ-17 QA: Owner Audit Log

## Ziel
Prüfen, dass Owner-Aktionen revisionssicher gespeichert und im Tenant-Detail lesbar angezeigt werden.

## Scope
- Audit-Logs für Owner-Aktionen in der Datenbank
- Ausgabe der Audit-Historie im Owner-Tenant-Detail
- keine Tokens oder Secrets im Audit-`context`
- Zugriff nur über Owner-Flows

## Vorbereitung
- lokaler Dev-Server läuft
- Migration `owner_audit_logs` ist angewendet
- mindestens ein Owner-Account verfügbar
- mindestens ein Test-Tenant mit Admin und Member vorhanden

## Kernfälle
- `Tenant erstellen`
  Erwartung: Audit-Eintrag `tenant_created` mit Tenant-Name, Slug und Admin-Kontext.
- `Tenant pausieren`
  Erwartung: Audit-Eintrag `tenant_status_updated` mit `inactive`.
- `Tenant fortsetzen`
  Erwartung: Audit-Eintrag `tenant_status_updated` mit `active`.
- `Basisdaten ändern`
  Erwartung: Audit-Eintrag `tenant_basics_updated` mit neuem Namen und/oder Slug.
- `Rechnungsdaten ändern`
  Erwartung: Audit-Eintrag `tenant_billing_updated`.
- `Kontaktdaten ändern`
  Erwartung: Audit-Eintrag `tenant_contact_updated`.
- `Admin neu zuweisen`
  Erwartung: Audit-Eintrag `tenant_admin_reassigned` mit Ziel-User und neuer Admin-Mail.
- `Admin-Setup erneut senden`
  Erwartung: Audit-Eintrag `tenant_admin_setup_resent`.
- `User löschen`
  Erwartung: Audit-Eintrag `tenant_user_deleted` mit `authDeleted`.
- `Tenant löschen`
  Erwartung: Audit-Eintrag `tenant_deleted` bleibt für Support und Nachvollziehbarkeit auswertbar.

## UI-Prüfung
- Im Owner-Tenant-Detail gibt es den Tab `Historie`.
- Die Historie zeigt lesbare Labels statt Roh-Eventnamen.
- Die neuesten Einträge stehen oben.
- `Actor` ist sichtbar.
- `Target` wird angezeigt, wenn ein Ziel-User betroffen ist.
- Leerer Zustand ist verständlich formuliert.

## Sicherheitsprüfung
- Passwörter, Tokens, Secrets oder Action-Links erscheinen nicht im Audit-`context`.
- Tenant-User ohne Owner-Rolle sehen die Historie nicht.
- Fehler beim Audit-Schreiben blockieren die eigentliche Owner-Aktion nicht.

## Regression
- Owner kann weiterhin Tenant anlegen, pausieren, fortsetzen und Admin neu zuweisen.
- Tenant-Detail lädt auch dann, wenn die Audit-Tabelle lokal noch nicht existiert.
- Die Historie aktualisiert sich nach Owner-Aktionen ohne manuellen Reload.

## Abnahme
- `PROJ-17` ist abnahmebereit, wenn alle Kernfälle geprüft sind und die Historie für Owner stabil sichtbar ist.

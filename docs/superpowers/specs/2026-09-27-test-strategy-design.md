# Teststrategie: Sinnvoller Ausbau nach dem Kassentag-Merge

**Status:** Genehmigt (Design)
**Datum:** 2026-09-27
**Umsetzungs-Gate:** Der Implementierungsplan wird vorab erstellt, aber erst ausgeführt, nachdem
`feature/kassentag` in `main` gemerged wurde. Vor dem ersten Umsetzungsschritt wird der Plan
gegen den dann aktuellen Stand von `main` geprüft und bei Bedarf angepasst.

## Ausgangslage

Der Branch `feature/kassentag` führt erstmals eine automatisierte Testbasis ein:

- Vitest 5 als Test-Runner
- Node.js als Testumgebung
- `fake-indexeddb` für IndexedDB-Tests
- `pnpm test` als einmalig durchlaufendes Testskript
- einen IndexedDB-Smoke-Test
- einen Test für das Datenbank-Upgrade von Version 1 auf Version 2

Diese Basis prüft bereits, dass IndexedDB grundsätzlich funktioniert und bestehende
Transaktionsdaten beim Schema-Upgrade erhalten bleiben. Noch nicht abgedeckt sind die
Geschäftsregeln des Kassensystems, Fehler- und Randfälle, Svelte-Komponenten sowie vollständige
Benutzerabläufe im Browser.

## Ziel

Nach dem Merge soll eine ausgewogene Testpyramide entstehen. Sie schützt zuerst die Abläufe mit
dem größten finanziellen oder datenbezogenen Schaden:

1. Checkout, Betragsberechnung und Datenerhalt
2. IndexedDB-Schema, atomare Schreibvorgänge und Migrationen
3. Bestand, Getränke-Kontingent, Rabatte und Kassentage
4. Einstellungen, Kategorien, Import und Export
5. zentrale Benutzerinteraktionen
6. reine Darstellung

Die Tests sollen lokal schnell ausführbar, in CI zuverlässig und bei Fehlern leicht
diagnostizierbar sein. Eine hohe Testanzahl oder Coverage-Prozentzahl ist kein Selbstzweck.

## Testarchitektur

### 1. Unit-Tests

Vitest prüft deterministische Geschäftslogik ohne Browser und ohne echte IndexedDB. Dazu gehören:

- Preis-, Datums- und Rundungsfunktionen
- Warenkorb-Mengen und Summen
- prozentuale Rabatte einschließlich 0 %, 100 %, ungültiger Werte und Rundungsgrenzen
- Wechselgeld und Zahlungsarten
- Getränke-Kontingent und Bestandsänderungen
- Normalisierung von Einstellungen und Kategorien
- Zuordnung und Zeitgrenzen von Kassentagen
- Transformationen für JSON-/XLSX-Import und -Export

Falls wichtige Regeln derzeit nur innerhalb großer Svelte-Dateien oder zusammen mit
Persistenzzugriffen ausführbar sind, dürfen kleine reine Funktionen extrahiert werden. Es soll
keine allgemeine Refaktorierung allein für eine theoretisch bessere Testbarkeit geben.

### 2. IndexedDB-Integrationstests

Vitest und `fake-indexeddb` prüfen die öffentliche API aus `src/lib/db/index.ts`. Die Tests
verwenden keine nachgebildete DB-Schnittstelle, sondern die tatsächlichen `idb`-Operationen.

Abzudecken sind:

- Neuinstallation mit Schema und Standardwerten
- Upgrade jeder unterstützten alten Schema-Version
- Erhalt und korrekte Ergänzung bestehender Daten
- Produkt-, Transaktions-, Einstellungs-, Kategorie- und Kassentag-CRUD
- Sortierung und Indexabfragen
- Normalisierung alter oder ungültiger Einstellungen
- Kategorie-Umbenennung und Verschiebung betroffener Produkte
- Verhalten bei unbegrenztem Bestand (`stock: null`)
- atomarer Checkout aus Transaktion, Einstellungen und Bestandsänderungen
- Rollback beziehungsweise ausbleibende Teilpersistenz bei einem Fehler
- Kassentag-Invarianten und Zuordnung von Transaktionen

Jeder Test erhält einen definierten Ausgangszustand. Datenbanken werden zwischen Tests
geschlossen und gelöscht; Modul-Singletons werden kontrolliert zurückgesetzt. Tests dürfen
nicht von ihrer Ausführungsreihenfolge abhängen.

### 3. Svelte-Komponententests

Svelte Testing Library mit einer DOM-Testumgebung wird nur für Komponenten eingesetzt, deren
Verhalten durch reine Unit-Tests nicht ausreichend geschützt ist:

- Warenkorb: Mengenänderung, Entfernen, Rabattdarstellung und Gesamtbetrag
- Checkout-Modals: Eingabe, Validierung, Zahlungsart und Bestätigung
- NumPad/Calculator: Tastatureingaben und Korrekturverhalten
- Admin-PIN-Gate: Freigabe und Fehlermeldung
- Kassentag-Start/-Stopp-Bedienelemente

Die Tests interagieren über sichtbare Rollen, Labels und Texte. Sie prüfen keine internen
Komponentenvariablen und vermeiden umfangreiche Snapshots.

### 4. Browser-Smoke-Tests

Playwright prüft nur wenige geschäftskritische Abläufe gegen die gebaute oder lokal gestartete
Anwendung:

1. Kassentag starten, Produkt verkaufen und Kassentag beenden
2. Barzahlung inklusive Wechselgeld
3. Kartenzahlung und prozentualer Rabatt
4. Bestands- und Getränke-Kontingentänderung nach Checkout
5. Admin-PIN und eine zentrale Verwaltungsänderung
6. Backup exportieren, Daten verändern und Backup wiederherstellen

Die Browser-Suite soll klein bleiben. Detailvarianten gehören in Unit- oder Integrationstests.
Für jeden Test wird der Browser-Speicher isoliert; Zeit, Beispieldaten und Selektoren müssen
deterministisch sein.

## Verzeichnis- und Skriptstruktur

Vorgesehene Struktur:

```text
tests/
  unit/
  integration/
  e2e/
  fixtures/
  helpers/
```

Die beim Merge vorhandenen Tests werden in die passende Struktur verschoben, ohne ihre Aussage
zu verändern. Gemeinsame Builder erzeugen gültige Produkte, Einstellungen, Transaktionen und
Kassentage mit überschreibbaren Feldern.

Vorgesehene Skripte:

- `pnpm test`: schnelle Vitest-Suite einmalig ausführen
- `pnpm test:watch`: Vitest im Watch-Modus
- `pnpm test:coverage`: Coverage-Bericht für Unit- und Integrationstests
- `pnpm test:e2e`: Playwright-Smoke-Suite
- `pnpm test:ci`: deterministische CI-Prüfung ohne Watch-Modus

Die endgültigen Skriptnamen werden beim Implementierungsplan gegen den nach dem Merge aktuellen
Stand geprüft.

## CI-Integration

Ein eigener Pull-Request-Workflow führt in dieser Reihenfolge aus:

1. `pnpm install --frozen-lockfile`
2. `pnpm check`
3. Vitest
4. Playwright-Smoke-Tests

Der vorhandene GitHub-Pages-Deploy bleibt davon getrennt. Ein fehlgeschlagener Qualitätscheck
verhindert nicht durch Seiteneffekte den bestehenden Deploy-Workflow, soll aber als verpflichtender
Branch-Protection-Check für Änderungen an `main` geeignet sein.

Coverage wird zunächst als Artefakt oder Job-Zusammenfassung sichtbar gemacht, aber nicht durch
einen globalen Mindestwert erzwungen. Nach stabiler Baseline können gezielte Schwellen für
geschäftskritische reine Module eingeführt werden. Pauschale Playwright-Retries sind kein Mittel,
um instabile Tests zu verdecken.

## Einführungsreihenfolge

### Phase 1: Testfundament stabilisieren

- Merge-Stand analysieren
- vorhandene Vitest-Konfiguration und Tests übernehmen
- DB-Isolation, Cleanup und wiederverwendbare Fixtures einführen
- lokale und CI-Skripte vereinheitlichen

### Phase 2: Geschäftslogik und Persistenz absichern

- Warenkorb, Rabatt, Rundung und Checkout testen
- atomare DB-Schreibvorgänge und Fehlerfälle testen
- sämtliche unterstützten Schema-Upgrades testen
- Kassentag-Invarianten und Alt-Daten-Migration testen
- Kategorien, Einstellungen, Bestand und Kontingent abdecken

Diese Phase liefert den größten Nutzen und muss abgeschlossen sein, bevor UI- oder E2E-Abdeckung
ausgebaut wird.

### Phase 3: Kritische Komponenten testen

- DOM-Testumgebung und Svelte Testing Library ergänzen
- Warenkorb, Checkout, NumPad und Admin-PIN prüfen
- nur stabile, nutzerorientierte Selektoren verwenden

### Phase 4: Browser-Smoke-Suite und CI

- Playwright konfigurieren
- Kernabläufe mit isolierter IndexedDB umsetzen
- PR-Workflow ergänzen
- Laufzeit und Stabilität beobachten

## Qualitätsregeln

- Ein Test beschreibt eine konkrete Geschäftsregel oder ein relevantes Fehlerszenario.
- Tests verwenden keine Produktionsdaten und hängen nicht von Netzwerkzugriffen ab.
- Zeit, Zufall und IDs werden kontrolliert, wenn sie das Ergebnis beeinflussen.
- DB-Tests dürfen keine Zustände an Folgetests weitergeben.
- UI-Tests prüfen Verhalten statt Implementierungsdetails.
- E2E-Tests duplizieren keine umfangreichen Varianten aus niedrigeren Testebenen.
- Fehlerpfade werden ebenso geprüft wie erfolgreiche Abläufe.
- Neue Fehlerbehebungen erhalten nach Möglichkeit zuerst einen reproduzierenden Regressionstest.

## Nicht im ersten Ausbau

- vollständige visuelle Regressionstests
- Tests auf realen Android-Geräten oder Emulatoren
- Performance- und Lasttests
- flächendeckende E2E-Abdeckung jeder Admin-Seite
- ein erzwungenes globales Coverage-Ziel
- Snapshot-Tests großer Svelte-Komponenten

Diese Punkte können später ergänzt werden, wenn reale Fehlerbilder oder Release-Anforderungen
ihren Nutzen rechtfertigen.

## Erfolgskriterien

Der erste Ausbau ist erfolgreich, wenn:

- die kritischen Rechen- und Checkout-Regeln deterministisch getestet sind,
- DB-Upgrades und Alt-Daten-Erhalt reproduzierbar abgesichert sind,
- ein fehlgeschlagener Teil des Checkouts keine inkonsistente Teilpersistenz hinterlässt,
- die wichtigsten POS- und Admin-Interaktionen Komponententests besitzen,
- die definierten Browser-Smoke-Flows lokal und in CI stabil laufen,
- Pull Requests automatisch Typprüfung, Unit-/Integrationstests und E2E-Smoke-Tests durchlaufen,
- die gesamte schnelle Suite kurz genug für regelmäßige lokale Ausführung bleibt.

## Voraussetzung für die Ausführung

Vor der Umsetzung wird geprüft, dass `feature/kassentag` vollständig in `main` enthalten ist.
Anschließend werden die im vorab erstellten Implementierungsplan genannten Dateipfade, APIs,
bestehenden Tests und Abhängigkeiten erneut mit dem aktuellen `main` abgeglichen. Notwendige
Plananpassungen werden vorgenommen, bevor Produktions- oder Testcode geändert wird.

# Kassentag: Abrechnungszeiträume über Mitternacht hinweg

**Status:** Genehmigt (Design)
**Datum:** 2026-09-19

## Problem

Die Abrechnung in KassenBuddy läuft aktuell strikt von 00:00 bis 23:59:59 (Kalendertag). Viele
Veranstaltungen (Vereinsfeste, Partys, Festivals) laufen aber über die Mitternachtsgrenze hinweg
und über stark unregelmäßige Zeiträume. Ein fixer täglicher Cutoff (wie in klassischen
Gastro-POS-Systemen mit z. B. 4-Uhr-Grenze) passt nicht, weil die Veranstaltungen weder täglich
noch zu ähnlichen Zeiten stattfinden.

## Recherche / Best Practice

POS-Systeme wie Toast oder Lightspeed verwenden für Gastronomie mit Nachtbetrieb einen
konfigurierbaren **"Trading Day" / "Business Day"**-Cutoff (typischerweise 1–2 Stunden nach
Ladenschluss, z. B. 4:00 Uhr), sodass ein Geschäftstag z. B. von 04:00 bis 03:59 des Folgetags
läuft. Für unregelmäßige Events ohne festen Rhythmus ist dagegen das Konzept einer manuell
gestarteten/beendeten **Kassenschicht ("Till Session" / "Cash Drawer Session")** üblich: Ein
Kassierer öffnet die Kasse zu Schichtbeginn und schließt sie nach Betriebsende ab; alle
Transaktionen dazwischen gehören zu dieser Schicht, unabhängig von der Uhrzeit.

Da KassenBuddy explizit für unregelmäßige Einzelveranstaltungen mit stark schwankenden Zeiten
genutzt wird, folgt dieses Design dem zweiten Muster: einer manuell gesteuerten Session,
hier **"Kassentag"** genannt.

## Lösung

### Begriff

Der neue Abrechnungszeitraum heißt **Kassentag**: ein durchgehender Zeitraum, der mit einem
Start-Button beginnt und mit einem Stop-Button (oder nachträglicher Korrektur) endet. Ein
Kassentag kann problemlos über Mitternacht hinweglaufen.

### Datenmodell

Neuer IndexedDB-Store `kassentage` (DB-Version 1 → 2):

```ts
interface Kassentag {
	id: string;
	startedAt: number;          // Zeitstempel Start
	endedAt: number | null;     // null = noch aktiv (laufend)
	status: 'open' | 'closed';
	source: 'manual' | 'legacy'; // manuell gestartet vs. rückwirkend migriert
}
```

`Transaction` erhält ein neues Pflichtfeld:

```ts
kassentagId: string | null; // null nur für nicht zuordenbare Alt-Daten (Edge-Case)
```

Neuer Index `by-kassentag` auf dem `transactions`-Store für performante Filterung ohne
Full-Table-Scan.

**Invarianten:**
- Es darf zu jedem Zeitpunkt höchstens ein Kassentag mit `status: 'open'` existieren.
- Anzeige ohne eigenen Namen: `"Kassentag <Startdatum>, <Startzeit> Uhr"` (z. B.
  „Kassentag 20.09.2026, 20:14 Uhr“), ergänzt um „läuft noch“ bei offenem Status.
- Das Getränke-Kontingent (`Settings.drinkQuotaCounter`) bleibt unverändert global über alle
  Kassentage hinweg (keine automatische Rücksetzung).

### Migration bestehender Daten

Bestehende Transaktionen haben kein `kassentagId`. Beim ersten Start nach dem Update werden sie
automatisch nachträglich zugeordnet:

- Gruppierung nach **Kalendertag** (00:00:00–23:59:59, über die vorhandenen
  `startOfDay`/`endOfDay`-Hilfsfunktionen).
- Pro betroffenem Kalendertag wird ein `Kassentag` mit `status: 'closed'`, `source: 'legacy'`
  angelegt, `startedAt`/`endedAt` auf Tagesanfang/-ende gesetzt, und alle Transaktionen dieses
  Kalendertags erhalten die entsprechende `kassentagId`.
- **Erkennung ist datengetrieben, nicht Flag-basiert:** Bei jedem `getDb()`-Aufruf wird günstig
  geprüft, ob `db.count('transactions') > db.countFromIndex('transactions', 'by-kassentag')`
  (zwei Zähloperationen, kein Scan). Ist das der Fall, werden die nicht zugeordneten
  Transaktionen migriert. Das macht den Vorgang **selbstheilend**: Auch später importierte
  Alt-Backups (JSON-Import ohne `kassentagId`) werden automatisch nachträglich zugeordnet, ohne
  gesonderte Logik im Import-Pfad.

### Kasse (POS)

- `src/routes/+page.svelte`: Kopfzeile zeigt den Status des aktiven Kassentags. Läuft einer:
  Startzeit + „🟢 läuft“ mit Button „Kassentag beenden“ (Bestätigung analog zum bestehenden
  „Warenkorb leeren“-Muster). Läuft keiner: Button „▶️ Kassentag starten“.
- `src/lib/components/pos/Cart.svelte`: Ist kein Kassentag aktiv, wird der „Bezahlen“-Button
  deaktiviert mit Hinweistext „Bitte zuerst Kassentag starten“. Der Warenkorb selbst bleibt
  nutzbar (Produkte hinzufügen/entfernen funktioniert weiterhin).
- `src/lib/stores/cart.svelte.ts`: `checkout()` liest den aktiven Kassentag und schreibt dessen
  `id` als `kassentagId` in die `Transaction` (über die bereits gebündelte
  `commitCheckout()`-Transaktion aus dem vorherigen Fix).

### Admin-Bereich

Neue Seite `src/routes/admin/kassentage/+page.svelte` (+ Sidebar-Eintrag „📅 Kassentage“ in
`admin/+layout.svelte`):

- Liste aller Kassentage, neueste zuerst. Je Zeile: Start, Ende (oder „läuft“), Dauer, Anzahl
  Transaktionen, Umsatz.
- Bearbeiten-Modal zur nachträglichen Korrektur von Start-/Endzeit — **auch beim aktuell
  laufenden Kassentag** editierbar (z. B. falls der Start vergessen wurde). Validierung:
  Startzeit muss vor Endzeit liegen (falls Endzeit gesetzt).

### Statistik-Seite

`src/routes/admin/statistics/+page.svelte`: Der bestehende Von/Bis-Datumsfilter wird durch ein
**Kassentag-Dropdown** ersetzt (inkl. Legacy-Einträge aus der Migration), mit einer zusätzlichen
Option „Alle“ für den ungefilterten Gesamtüberblick. Intern ersetzt
`getTransactionsByKassentag(id)` den bisherigen `getTransactionsByDateRange()`-Aufruf.

Beim manuellen Anlegen/Bearbeiten einer Transaktion (Modal „Neue Transaktion“ /
„Transaktion bearbeiten“) wird `kassentagId` automatisch anhand des eingegebenen Zeitstempels
über `findKassentagForTimestamp(timestamp)` bestimmt — kein zusätzliches Auswahlfeld im
Formular. Liefert kein Kassentag einen passenden Zeitraum, bleibt `kassentagId: null`.

### Export

`src/lib/utils/export.ts`:
- Excel-Export (Transaktionen & Produktübersicht): Titel/Sheet ergänzt um den Kassentag-Zeitraum,
  z. B. „Kassentag: 20.09.2026 20:14 – 21.09.2026 03:40“, oder „Alle Kassentage“ bei
  ungefiltertem Export.
- JSON-Export: Transaktionen enthalten bereits `kassentagId`; zusätzlich wird der zugehörige
  `Kassentag`-Datensatz (falls gefiltert) als Metadaten-Objekt im Export mitgeliefert.

### Neue DB-Funktionen (`src/lib/db/index.ts`)

- `getActiveKassentag(): Promise<Kassentag | null>`
- `startKassentag(): Promise<Kassentag>` — wirft Fehler, falls bereits ein Kassentag offen ist
- `endKassentag(id: string): Promise<void>` — setzt `endedAt`/`status: 'closed'`
- `getAllKassentage(): Promise<Kassentag[]>` — absteigend nach `startedAt` sortiert
- `updateKassentagTimes(id: string, startedAt: number, endedAt: number | null): Promise<void>`
- `getTransactionsByKassentag(id: string): Promise<Transaction[]>` — nutzt `by-kassentag`-Index
- `findKassentagForTimestamp(timestamp: number): Promise<Kassentag | null>`

## Nicht im Scope

- Kein benutzerdefinierter Name/Label je Kassentag (nur automatische Zeit-basierte Anzeige).
- Kein automatisches Zurücksetzen des Getränke-Kontingents pro Kassentag.
- Kein fixer täglicher Cutoff-Mechanismus (z. B. „immer 6 Uhr“) — ausschließlich manuelle
  Start/Stop-Steuerung plus nachträgliche Korrektur.
- Mehrere gleichzeitig offene Kassentage sind nicht vorgesehen (Single-Active-Invariante).

## Offene technische Aspekte für den Implementierungsplan

- Exaktes UI-Layout des Start/Stop-Bedienelements in der Kopfzeile (Platzierung neben
  Kontingent-Anzeige).
- Fehlerbehandlung, falls `startKassentag()` wegen Race Condition (z. B. zwei Tabs) einen
  Konflikt meldet.

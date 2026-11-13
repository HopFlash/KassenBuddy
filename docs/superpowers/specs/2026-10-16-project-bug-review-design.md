# Projektweiter Bug- und Stabilitätsreview

## Ziel

Klar belegbare Bugs und Stabilitätsprobleme in KassenBuddy finden und mit
gezielten Änderungen beheben. Der Fokus liegt auf dem offlinefähigen
Kassenbetrieb und den Datenflüssen, die Verkäufe oder gespeicherte Daten
beeinflussen.

## Vorgehen

Den manuellen Review auf die zentralen Laufzeit- und Datenflüsse ausrichten:

- Warenkorb, Preis-/Rabattberechnung und Checkout
- Speicherung und Laden von Produkten, Transaktionen und Einstellungen
- Backup- und Transaktionsimport/-export
- relevante Offline-/PWA- und App-Lifecycle-Grenzen

Die tatsächlichen Einstiegspunkte und vorhandenen Tests werden vor der
Detailprüfung aus dem Repository ermittelt. Automatisierte Projektchecks
ergänzen den Review; sie ersetzen ihn nicht.

## Fix-Grenzen

Nur reproduzierbare oder durch den Code klar belegbare Fehler beheben, die den
Kassenbetrieb, die Datenintegrität oder die Stabilität beeinträchtigen. Die
Änderungen bleiben minimal und folgen den bestehenden Projektmustern. Größere
Refactorings, neue Features und spekulative Härtung sind nicht Teil des Umfangs.

## Validierung

Für jede Änderung möglichst die vorhandenen passenden Tests ausführen oder einen
gezielten Regressionstest ergänzen. Anschließend die vorhandenen
Type-/Projektchecks und den Produktionsbuild ausführen (`pnpm check`, `pnpm
build`). Falls eine Prüfung an der Umgebung scheitert, wird das Ergebnis als
blockiert ausgewiesen und nicht als erfolgreich behandelt.

## Erfolgskriterien

- Jeder behobene Fehler hat eine konkrete Ursache und nachvollziehbare
  Regression-Absicherung oder Validierung.
- Unbestätigte Auffälligkeiten werden nicht als Bugs ausgegeben.
- Bestehendes Verhalten außerhalb der Fehlerbehebungen bleibt unverändert.
- Die ausgeführten Checks und verbleibenden Einschränkungen werden knapp
  dokumentiert.

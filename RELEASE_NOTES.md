# KassenBuddy – Release Notes

Hier findest du die wichtigsten Änderungen für den Kassenalltag.
Die Datumsangaben stammen aus der Git-Historie und sind keine bestätigten
Veröffentlichungstermine. Version 1.2.0 beschreibt den aktuellen Projektstand;
eine Veröffentlichung ist nicht bestätigt.

## Version 1.2.0 – Stand: 13.11.2026

### Neu: Feste Schnellrabatte

- Neben Prozenten kannst du jetzt auch feste Euro-Beträge als Schnellrabatt
  vergeben. Die drei Startwerte sind **1 €, 2 € und 3 €**.
- In den Einstellungen kannst du die Werte anpassen und Prozent- und
  Euro-Rabatte unabhängig voneinander ein- oder ausschalten.
- Ein neuer Schnellrabatt ersetzt den bisherigen. Ein fester Rabatt wird
  höchstens bis zur Höhe der Zwischensumme abgezogen.
- Bestehende Einstellungen bleiben erhalten; die neuen Optionen erhalten
  passende Standardwerte.

### Verbesserungen

- Die Rabatt-Buttons stehen in getrennten Zeilen und sind größer. So lassen
  sie sich an der Kasse leichter treffen.
- Bereits angewendete Rabatte lassen sich weiterhin entfernen, auch wenn
  beide Rabattarten in den Einstellungen ausgeschaltet sind.

## Rückblick: Frühere Änderungen

Die folgenden Einträge beschreiben nach Datum belegbare Änderungen. Wo keine
eindeutige Versionszuordnung vorliegt, steht bewusst nur das Änderungsdatum.

### 17.10.2026 – Stabilität und Datensicherung

- Schlägt das Speichern einer Zahlung fehl, zeigt die Kasse eine Fehlermeldung
  an und der Warenkorb bleibt für einen erneuten Versuch erhalten.
- Backup-Dateien werden vor dem Import auf ungültige oder doppelte Produkte
  geprüft. Produkte und Einstellungen werden gemeinsam ersetzt, damit bei
  einem fehlgeschlagenen Import keine halbe Wiederherstellung entsteht.

### 28.09.2026 – Kassentage

- Ein **Kassentag** lässt sich manuell starten und beenden und kann über
  Mitternacht hinauslaufen – praktisch für längere Veranstaltungen.
- Vor dem Bezahlen muss ein Kassentag gestartet sein. Der Warenkorb lässt
  sich auch ohne aktiven Kassentag vorbereiten.
- Im Adminbereich kannst du Kassentage einsehen und ihre Zeiten korrigieren.
  Statistiken und Exporte lassen sich nach Kassentagen auswerten.
- Ältere Verkäufe werden nach Kalendertagen bestehenden oder neu angelegten
  Kassentagen zugeordnet.

### Version 1.1.2 – 19.09.2026

- Verkäufe, Bestandsänderungen und das Getränkekontingent werden beim
  Bezahlen gemeinsam gespeichert.

### Version 1.1.1 – 27.07.2026

- Die Berechnung der Warenkorb- und Rabattwerte wurde überarbeitet, damit sie
  bei Änderungen des Warenkorbs aktuell bleiben.

### Version 1.1.0 – 23.07.2026

- Produktkategorien lassen sich im Adminbereich anlegen, umbenennen und
  löschen. Die Produktverwaltung wurde dafür erweitert.

### 23.07.2026 – Android-Unterstützung

- KassenBuddy erhielt ein Android-Projekt und Build-Skripte für APK- und
  AAB-Pakete unter Windows und Linux.

### 07.06.2026 – Dashboard und Bedienung

- Im Dashboard kann zwischen Tagen navigiert werden; der Diagrammtitel passt
  sich dem ausgewählten Tag an.
- Zahleneingabe und Bezahlansicht wurden für eine angenehmere Bedienung
  überarbeitet.

### Version 1.0.3 – 06.04.2026

- Für den Bezahlvorgang stehen ein kompaktes und ein klassisches Layout zur
  Auswahl.
- Die Eingabe negativer Zahlbeträge wurde anschließend mit klarerer
  Rückmeldung verbessert.

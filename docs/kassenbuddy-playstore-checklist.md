# KassenBuddy Play-Store Checkliste

## 1) Account & Zugriff

- [ ] Google Play Developer-Konto angelegt (einmalig 25 USD).
- [ ] Play Console Zugriff für alle Beteiligten eingerichtet (Owner/Release Manager).

## 2) App-Identität

- [ ] Finalen Paketnamen prüfen: `de.kassenbuddy.app` (nicht mehr ändern).
- [ ] App-Name, Kurzbeschreibung, Vollbeschreibung finalisieren.
- [ ] Versionsnummern konsistent halten (Version Name + Version Code im Android-Projekt).

## 3) Android-Build vorbereiten

- [ ] Web-Assets aktualisieren: `pnpm build:android`
- [ ] Release-AAB bauen:
  - Windows: `pnpm android:aab:windows`
  - Linux/macOS: `pnpm android:aab:linux`
- [ ] AAB vorhanden: `android/app/build/outputs/bundle/release/app-release.aab`

## 4) Signing

- [ ] Keystore sicher erstellt/gesichert (Backup außerhalb des Repos).
- [ ] Release-Signing in Android Studio oder Gradle korrekt konfiguriert.
- [ ] Finales AAB ist signiert und installierbar.

## 5) Pflichtangaben in Play Console

- [ ] App-Kategorie und Kontaktadresse gesetzt.
- [ ] Datenschutzrichtlinie (URL) hinterlegt.
- [ ] Data Safety Formular ausgefüllt.
- [ ] Content Rating Fragebogen abgeschlossen.
- [ ] Zielgruppe/Ads/Policy-Fragen vollständig beantwortet.

## 6) Store-Eintrag (Listing)

- [ ] App-Icon (512x512) hochgeladen.
- [ ] Feature Graphic (1024x500) hochgeladen.
- [ ] Screenshots für Smartphone (und optional Tablet) hochgeladen.
- [ ] Deutsche Texte geprüft (Rechtschreibung, konsistente Begriffe).

## 7) Release-Strategie

- [ ] Interner Test-Track zuerst erstellen.
- [ ] Tester hinzufügen und Build im internen Track ausrollen.
- [ ] Kernflüsse testen:
  - POS Verkauf (Bar/Karte)
  - Admin-PIN
  - Produkt-/Kategorienverwaltung
  - Statistik/Export
  - Backup/Restore
- [ ] Crash-/ANR-Signale beobachten.

## 8) Go-Live

- [ ] Produktions-Release aus internem/geschlossenem Track promoten.
- [ ] Rollout schrittweise starten (z. B. 10% → 50% → 100%).
- [ ] Nach Release aktiv monitoren (Crash, Bewertungen, Policy-Hinweise).

## 9) Optional: Nicht öffentlich verteilte App

- [ ] Statt Produktion nur interner/geschlossener Track verwenden.
- [ ] Für Organisationen: Managed Google Play private App prüfen.

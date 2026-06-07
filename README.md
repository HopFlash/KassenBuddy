# 🧾 KassenBuddy

KassenBuddy ist ein **offline-fähiges Kassensystem** als Progressive Web App (PWA), gebaut mit SvelteKit und TailwindCSS. Es eignet sich ideal für den schnellen Verkauf an der Theke, auf Events oder überall dort, wo eine einfache, zuverlässige Kasse ohne Internetverbindung benötigt wird.

---

## ✨ Features

### Kassensystem (POS)
- **Produktraster** mit Kategoriefilter – Produkte per Tap direkt in den Warenkorb legen
- **Warenkorb** mit Mengenänderung und Einzelpositions-Entfernung
- **Bezahl-Dialog** in zwei Layouts wählbar:
  - 📱 **Kompakt** – optimiert für kleine Bildschirme und Querformat (z. B. Tablets)
  - 🖥️ **Klassisch** – größere Buttons für komfortables Bedienen
- **Bar- und Kartenzahlung** mit automatischer Rückgeldberechnung
- **Prozentuale Schnellrabatte** (3 konfigurierbare Buttons) als eigene Rabattposition im Warenkorb
- **Getränke-Kontingent-Zähler** – zeigt verbleibendes Kontingent farblich an (grün/gelb/rot) und wird pro Verkauf automatisch reduziert
- **Taschenrechner** direkt in der Kassen-Ansicht

### Adminbereich (PIN-geschützt)
- **Dashboard** mit Tages- und Gesamtumsatz, Transaktionsanzahl, aktivem Produktbestand und stündlichem Umsatz-Diagramm
- **Produktverwaltung** – Produkte anlegen, bearbeiten und löschen mit:
  - Name, Verkaufspreis und optionalem Einkaufspreis
  - Kategorie (Bier, Wein, Spirituosen, Softdrinks, Wasser, Cocktails, Snacks, Sonstiges)
  - Produktbild (Upload, Zuschnitt)
  - Sortierreihenfolge und Aktiv/Inaktiv-Status
  - Optionale Lagerverwaltung (Stückzahl, automatisch reduziert)
- **Statistik & Export**
  - Umsatzübersicht gesamt und nach Zahlungsart (Bar / Karte)
  - Produktauswertung mit Balkendiagramm
  - Transaktionsliste mit Bearbeitungs- und Löschfunktion, manuelle Transaktionen anlegen
  - Datumsfilter für Zeitraumauswertungen
  - Export als **Excel** (Transaktionsliste oder Produktübersicht)
  - Export/Import von Transaktionsdaten als **JSON** (zum Zusammenführen mehrerer Kassen)
- **Einstellungen**
  - Kassenname, Währung
  - Admin-PIN ändern (mind. 4 Stellen)
  - 3 Schnellrabatt-Werte frei konfigurierbar
  - Getränke-Kontingent setzen
  - Checkout-Layout wählen (Kompakt / Klassisch)
  - **Datensicherung**: vollständiger Backup-Export (Produkte inkl. Bilder + Einstellungen als JSON) und -Import

---

## 🛠️ Technologie-Stack

| Technologie | Einsatz |
|---|---|
| [SvelteKit](https://kit.svelte.dev/) | Frontend-Framework |
| [Svelte 5](https://svelte.dev/) | Reaktive UI mit Runes |
| [TailwindCSS 4](https://tailwindcss.com/) | Styling |
| [Vite PWA](https://vite-pwa-org.netlify.app/) | Service Worker & Offline-Unterstützung |
| [IndexedDB (idb)](https://github.com/jakearchibald/idb) | Lokale Datenbankpersistenz im Browser |
| [xlsx](https://sheetjs.com/) | Excel-Export |
| `@sveltejs/adapter-static` | Statischer Build (kein Server nötig) |

---

## 🚀 Erste Schritte

### Voraussetzungen

- [Node.js](https://nodejs.org/) ≥ 18
- [pnpm](https://pnpm.io/) (empfohlen) oder npm

### Installation & Entwicklungsserver starten

```sh
pnpm install
pnpm dev
```

oder mit npm:

```sh
npm install
npm run dev
```

Die App ist dann unter [http://localhost:5173](http://localhost:5173) erreichbar.

### Typen prüfen

```sh
pnpm check
```

### Produktions-Build erstellen

```sh
pnpm build
pnpm preview
```

Der fertige Build liegt im Ordner `build/` und kann auf jedem statischen Webserver oder lokal geöffnet werden.

---

## 📦 Deployment

Da KassenBuddy als statische PWA gebaut wird (`adapter-static`), kann der `build/`-Ordner auf beliebigen Hosting-Diensten bereitgestellt werden, z. B.:

- GitHub Pages
- Netlify / Vercel
- Nginx / Apache
- Direkt als lokale Datei im Browser öffnen

Die App funktioniert nach dem ersten Laden vollständig **offline** dank Service Worker und IndexedDB.

---

## 🔐 Admin-Zugang

Der Adminbereich ist per PIN gesichert. Der Standard-PIN lautet **`1234`** und sollte nach der Ersteinrichtung unter *Admin → Einstellungen → Admin-PIN ändern* angepasst werden.

---

## 📁 Projektstruktur

```
src/
├── lib/
│   ├── components/
│   │   ├── pos/          # Kassensystem-Komponenten (Grid, Warenkorb, Checkout)
│   │   └── shared/       # Wiederverwendbare UI-Komponenten
│   ├── db/               # IndexedDB-Zugriff (Produkte, Transaktionen, Einstellungen)
│   ├── stores/           # Reaktive Svelte-Stores (z. B. Warenkorb)
│   ├── types/            # TypeScript-Typen und Konstanten
│   └── utils/            # Hilfsfunktionen (Backup, Export, Währung, Bild)
└── routes/
    ├── +page.svelte      # Hauptkasse (POS)
    └── admin/
        ├── +page.svelte       # Admin-Dashboard
        ├── products/          # Produktverwaltung
        ├── statistics/        # Statistik & Export
        └── settings/          # Einstellungen & Datensicherung
```

---

## 📄 Lizenz

Dieses Projekt steht unter der [MIT-Lizenz](LICENSE).

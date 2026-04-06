# SvelteKit PWA mit relativen Pfaden – Referenz fuer LLMs

Projektkontext: KassenBuddy

> **Zweck:** Dieses Dokument enthält alle Lösungen und Konfigurationen, die nötig sind, um eine SvelteKit-App als **offline-fähige PWA** zu bauen, die in einem **beliebigen Unterverzeichnis** einer bestehenden Website deployt werden kann (z. B. `https://example.com/meine-app/`). Es fasst erprobte Patterns zusammen und warnt vor bekannten Fallstricken.

---

## 1. Überblick Tech-Stack

| Komponente | Paket | Hinweise |
|---|---|---|
| Framework | SvelteKit 2 + Svelte 5 (Runes) | `$state`, `$derived`, `$props` etc. |
| CSS | Tailwind CSS v4 | `@tailwindcss/vite` Plugin |
| Build | `@sveltejs/adapter-static` | Statisches Prerendering, kein Server |
| PWA | `@vite-pwa/sveltekit` + `workbox-window` | Service Worker via Workbox |
| Offline-DB | `idb` (IndexedDB-Wrapper) | Typed Wrapper um IndexedDB |
| Package Manager | pnpm | |

---

## 2. Kernproblem: Absolute vs. relative Pfade

SvelteKit und `@vite-pwa/sveltekit` generieren standardmäßig **absolute Pfade** (`/`, `/admin`, `/manifest.webmanifest`). Das funktioniert nur, wenn die App im Root einer Domain liegt. Für Subdirectory-Deployment müssen **alle** Pfade relativ sein.

### Betroffene Stellen (vollständige Liste):

1. **HTML-Links in Svelte-Komponenten** (`href="/admin"` → `href="{base}/admin"`)
2. **PWA-Manifest** (`start_url: '/'` → `start_url: '.'`)
3. **Manifest `<link>`-Tag** (vom PWA-Plugin generiert → manuell setzen)
4. **Service Worker `navigateFallback`** (generiert absolute URL → deaktivieren)
5. **Service Worker Registrierung** (`registerSW.js` Pfad)
6. **Adapter-Static Fallback** (überschreibt prerenderte `index.html`)

---

## 3. Konfigurationsdateien (vollständig)

### 3.1 `svelte.config.js`

```js
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter(),  // KEIN fallback: 'index.html' setzen!
    paths: {
      relative: true     // KRITISCH: Erzeugt relative Pfade in HTML
    },
    serviceWorker: {
      register: false     // Wird vom PWA-Plugin übernommen
    }
  }
};

export default config;
```

**Fallstricke:**
- `fallback: 'index.html'` in adapter-static **NICHT** setzen. Es überschreibt die prerenderte `index.html` mit einer Version, die absolute Asset-Pfade enthält.
- `paths.relative: true` ist die wichtigste Einstellung. Ohne sie generiert SvelteKit absolute Pfade in allen HTML-Dateien.

### 3.2 `vite.config.ts`

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'App Name',
        short_name: 'App',
        description: 'Beschreibung',
        theme_color: '#1e293b',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '.',   // KRITISCH: Punkt statt Slash!
        scope: '.',        // KRITISCH: Punkt statt Slash!
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        globIgnores: ['server/**'],
        navigateFallback: null  // KRITISCH: Deaktivieren!
      }
    })
  ]
});
```

**Fallstricke:**
- `start_url` und `scope` MÜSSEN `'.'` sein (nicht `'/'`). Sonst funktioniert die PWA-Installation nur im Domain-Root.
- `navigateFallback` MUSS `null` sein. Workbox generiert sonst `createHandlerBoundToURL('/')` im Service Worker, was einen absoluten Pfad erzwingt.
- `runtimeCaching` vermeiden, wenn nicht nötig – die `urlPattern`-RegExp darin kann ebenfalls absolute Pfade erzeugen.

### 3.3 `src/app.html`

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#1e293b" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <link rel="apple-touch-icon" href="%sveltekit.assets%/icon-192.png" />
    %sveltekit.head%
  </head>
  <body>
    <div style="display: contents">%sveltekit.body%</div>
    <script src="%sveltekit.assets%/registerSW.js"></script>
  </body>
</html>
```

**Hinweis:** `%sveltekit.assets%` wird automatisch in den richtigen relativen Pfad aufgelöst (z. B. `./` oder `../`). Die `registerSW.js`-Einbindung muss hier stehen, nicht in einer Svelte-Komponente.

### 3.4 `src/routes/+layout.ts`

```ts
export const prerender = true;
```

**Warum:** Jede Route bekommt ihre eigene HTML-Datei mit korrekten relativen Pfaden. Ohne Prerendering gibt es nur eine `index.html` mit absoluten Pfaden als Fallback.

**NICHT verwenden:**
```ts
// FALSCH für Subdirectory-Deployment:
export const ssr = false;
export const prerender = false;
```

### 3.5 `src/routes/+layout.svelte` – Manifest-Link manuell setzen

```svelte
<script lang="ts">
  import '../app.css';
  import { base } from '$app/paths';
  let { children } = $props();
</script>

<svelte:head>
  <link rel="manifest" href="{base}/manifest.webmanifest" />
</svelte:head>

{@render children()}
```

**Fallstrick:** Das PWA-Plugin bietet `virtual:pwa-info` an, um den Manifest-Link automatisch einzufügen. **NICHT verwenden!** Es generiert `<link href="/manifest.webmanifest">` mit absolutem Pfad. Stattdessen den Link manuell mit `{base}` setzen.

---

## 4. Links in Komponenten

**Jeder interne Link** in der gesamten App muss `base` aus `$app/paths` verwenden:

```svelte
<script lang="ts">
  import { base } from '$app/paths';
</script>

<a href="{base}/admin">Admin</a>
<a href="{base}/admin/products">Produkte</a>
<a href="{base}/">Startseite</a>
```

**Programmatische Navigation:**
```ts
import { goto } from '$app/navigation';
import { base } from '$app/paths';

goto(`${base}/admin`);
```

**NIEMALS** hardcoded absolute Links verwenden:
```svelte
<!-- FALSCH: -->
<a href="/admin">Admin</a>
```

---

## 5. Fetch-Aufrufe für statische Assets

Wenn die App zur Laufzeit statische Dateien laden muss (z. B. Default-Daten), `base` verwenden:

```ts
const { base } = await import('$app/paths');
const res = await fetch(`${base}/default.json`);
```

In Nicht-Komponenten-Dateien (z. B. DB-Modul) muss `$app/paths` per dynamischem `import()` geladen werden.

---

## 6. Offline-Datenbank mit Default-Daten

Pattern für eine IndexedDB, die beim ersten Start automatisch Default-Daten aus einer mitgelieferten JSON-Datei lädt:

```ts
import { openDB } from 'idb';

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB('app-db', 1, {
    upgrade(db) {
      db.createObjectStore('items', { keyPath: 'id' });
      db.createObjectStore('settings');
    }
  });

  // Default-Daten laden, wenn DB leer ist
  const count = await dbInstance.count('items');
  if (count === 0) {
    await loadDefaults(dbInstance);
  }

  return dbInstance;
}

async function loadDefaults(db) {
  try {
    const { base } = await import('$app/paths');
    const res = await fetch(`${base}/default.json`);
    if (!res.ok) return;
    const data = await res.json();

    const tx = db.transaction('items', 'readwrite');
    for (const item of data.items) {
      // ggf. Daten-Transformation (z.B. base64 → Blob)
      await tx.store.put(item);
    }
    await tx.done;
  } catch {
    // App funktioniert auch ohne Defaults
  }
}
```

Die JSON-Datei liegt in `static/default.json` und wird automatisch in den Build kopiert.

---

## 7. Build & Deployment

### Build-Befehl

```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

Kein Postbuild-Skript nötig. Kein manuelles Pfad-Fixing.

### Deployment

Den Inhalt des `build/`-Ordners in ein beliebiges Verzeichnis auf dem Webserver kopieren. Beispiel:

```
https://example.com/meine-app/
├── index.html
├── admin.html
├── admin/
│   ├── products.html
│   ├── settings.html
│   └── statistics.html
├── manifest.webmanifest
├── registerSW.js
├── sw.js
├── default.json
└── _app/
    └── immutable/
        ├── chunks/
        ├── entry/
        ├── nodes/
        └── assets/
```

### Verifikation nach dem Build

Prüfen, ob die relativen Pfade korrekt sind:

```bash
# Root-HTML sollte ./ verwenden:
grep -o 'href="[^"]*"' build/index.html | head

# Unterseiten sollten ../ verwenden:
grep -o 'href="[^"]*"' build/admin/products.html | head

# SW sollte KEINE absoluten Pfade enthalten:
grep 'createHandlerBoundToURL' build/sw.js  # Sollte KEIN Ergebnis liefern

# Manifest prüfen:
cat build/manifest.webmanifest  # start_url und scope sollten "." sein
```

---

## 8. Bekannte Sackgassen (NICHT versuchen)

### ❌ `vite-plugin-singlefile`
Inkompatibel mit SvelteKit. Plugin erwartet ein einzelnes Entry, SvelteKit hat mehrere.

### ❌ Rollup-Postbuild-Inlining (alles in eine HTML-Datei)
Scheitert an:
- `</script>` in inline-Strings bricht den Parser
- `$`-Zeichen in String-Replacement-Patterns
- `globalThis`-Zugriff im Strict Mode
- Manifest-CORS-Probleme mit Blob-URLs

### ❌ `file://`-Protokoll
PWAs, Service Worker und viele Web-APIs funktionieren nicht über `file://`. Nicht versuchen.

### ❌ `virtual:pwa-info` für den Manifest-Link
Generiert absolute Pfade. Manuellen `<link>` mit `{base}` verwenden.

### ❌ `navigateFallback: '/'` oder `navigateFallback: 'index.html'`
Erzeugt absolute Routing-Regeln im Service Worker. Auf `null` setzen.

### ❌ `fallback: 'index.html'` in adapter-static
Überschreibt die korrekt prerenderte `index.html`. Nicht setzen, wenn alle Routen prerendert werden.

### ❌ `ssr: false` + `prerender: false`
Ohne Prerendering gibt es keine individuellen HTML-Dateien pro Route. Alle Seitenaufrufe landen auf einer einzigen `index.html` mit absoluten Pfaden.

---

## 9. Checkliste für neue Projekte

- [ ] `paths.relative: true` in `svelte.config.js`
- [ ] `adapter-static()` ohne `fallback`
- [ ] `serviceWorker.register: false` in `svelte.config.js`
- [ ] `start_url: '.'` und `scope: '.'` im PWA-Manifest
- [ ] `navigateFallback: null` in Workbox-Config
- [ ] `export const prerender = true` in `+layout.ts`
- [ ] Manifest-Link manuell mit `{base}` in `+layout.svelte`
- [ ] `registerSW.js` in `app.html` via `%sveltekit.assets%`
- [ ] **Alle** internen Links über `{base}` aus `$app/paths`
- [ ] **Alle** `goto()`-Aufrufe über `${base}/...`
- [ ] **Alle** Fetch-Aufrufe für statische Assets über `${base}/...`
- [ ] `virtual:pwa-info` NICHT importieren
- [ ] Nach dem Build: Relative Pfade in HTML/SW verifizieren

---

## 10. Abhängigkeiten (package.json)

```json
{
  "devDependencies": {
    "@sveltejs/adapter-static": "^3.0.10",
    "@sveltejs/kit": "^2.50.0",
    "@tailwindcss/vite": "^4.2.0",
    "@vite-pwa/sveltekit": "^1.1.0",
    "svelte": "^5.50.0",
    "tailwindcss": "^4.2.0",
    "typescript": "^5.9.0",
    "vite": "^7.3.0",
    "workbox-window": "^7.4.0"
  },
  "dependencies": {
    "idb": "^8.0.3"
  }
}
```

`workbox-window` wird von `@vite-pwa/sveltekit` als Peer-Dependency benötigt. Ohne explizite Installation gibt es Runtime-Fehler.

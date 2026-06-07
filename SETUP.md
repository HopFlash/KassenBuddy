# KassenBuddy Setup & Entwickler-Guide

## Systemanforderungen

- **Node.js**: ≥ 24 (empfohlen: 24 LTS)
- **pnpm**: ≥ 11
- **OS**: Linux, macOS, Windows

## Installation

### 1. Repository klonen

```sh
git clone https://github.com/HopFlash/KassenBuddy.git
cd KassenBuddy
```

### 2. Dependencies installieren

```sh
pnpm install
```

Falls Sie npm nutzen:

```sh
npm install
```

## Entwicklung

### Entwicklungsserver starten

```sh
pnpm dev
```

Die App öffnet sich unter [http://localhost:5173](http://localhost:5173).

### TypeScript-Überprüfung

```sh
pnpm check
```

Für kontinuierliche Überprüfung:

```sh
pnpm check:watch
```

### Build erstellen

```sh
pnpm build
```

Output: `build/` Ordner mit statischen Assets.

### Build lokal testen

```sh
pnpm preview
```

## Projektstruktur

```
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml      # GitHub Actions CI/CD
├── pnpm-workspace.yaml           # pnpm Workspace-Konfiguration
├── pnpm-lock.yaml                # Dependency-Lock (immer committen!)
├── svelte.config.js              # SvelteKit-Konfiguration
├── vite.config.ts                # Vite-Konfiguration
├── tsconfig.json                 # TypeScript-Konfiguration
├── src/
│   ├── lib/
│   │   ├── components/           # Svelte-Komponenten
│   │   ├── db/                   # IndexedDB-Logik
│   │   ├── stores/               # Reactive State (Svelte Stores)
│   │   ├── types/                # TypeScript-Typen
│   │   └── utils/                # Hilfsfunktionen
│   ├── routes/                   # SvelteKit Pages & Layouts
│   └── app.html                  # HTML-Entry-Point
└── static/                       # Statische Assets (Icons, etc.)
```

## pnpm Workspace

Das Projekt nutzt **pnpm Workspaces** für flexible Mono-Repo-Struktur:

```yaml
# pnpm-workspace.yaml
packages:
  - '.'

settings:
  autoInstallPeers: true
  nodeLinker: hoisted

catalogs:
  default:
    svelte: ^5.55.9
    typescript: ^6.0.3
    vite: ^8.0.14
```

**Features:**
- `autoInstallPeers: true` – Installiert Peer-Dependencies automatisch
- `nodeLinker: hoisted` – Hoisted Module für bessere Kompatibilität
- `catalogs` – Zentrale Dependency-Versionen (zukünftig für Multi-Package)

## GitHub Actions & Deployment

### Workflow: `deploy-pages.yml`

**Trigger:**
- Automatisch: Push auf `main`
- Manuell: GitHub Actions UI → "Run workflow"

**Environment:**
- Node.js 24 (native)
- pnpm 11
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` – Zwingt Actions auf Node.js 24

**Build-Prozess:**
1. Checkout Code
2. Setup pnpm + Node.js
3. Configure pnpm für esbuild (Build-Script-Genehmigung)
4. Install Dependencies (`--frozen-lockfile`)
5. Build SvelteKit → `build/` Folder
6. Upload zu GitHub Pages Artifact
7. Deploy zu GitHub Pages

### Sicherheit: pnpm 11 Build-Scripts

pnpm 11 blockiert standardmäßig alle Build-Skripte externe Packages (Security-First):

```sh
# Genehmigt esbuild im Workflow
pnpm config set --global build-scripts-allowed-packages '["esbuild"]'
```

Dies verhindert Supply-Chain-Attacks und ist **normalerweise nicht lokal nötig** (pnpm findet automatisch trusted packages).

## Häufige Fehler & Lösungen

### ❌ `ERR_PNPM_IGNORED_BUILDS`

```
Error: ERR_PNPM_IGNORED_BUILDS - Ignored build scripts: esbuild@0.27.4
```

**Ursache:** pnpm 11 blockiert Build-Skripte.

**Lösung:** Im Workflow bereits enthalten:
```sh
pnpm config set --global build-scripts-allowed-packages '["esbuild"]'
```

Lokal normalerweise nicht nötig. Falls doch:
```sh
pnpm config set --global build-scripts-allowed-packages '["esbuild"]'
pnpm install --force
```

### ❌ Node.js 20 Deprecation Warning in Actions

```
Warning: Node.js 20 is deprecated. The following actions target Node.js 20...
```

**Ursache:** Actions auf v4 nutzen Node.js 20.

**Lösung:** Bereits implementiert:
- Actions auf v5 aktualisiert (Node.js 24 native)
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` gesetzt

### ❌ Lockfile-Konflikte

**Lösung:** Nie `pnpm install` ohne `--frozen-lockfile` in CI committen:
```sh
git checkout pnpm-lock.yaml
pnpm install --frozen-lockfile
git add pnpm-lock.yaml
```

## Best Practices

### Abhängigkeiten hinzufügen

```sh
# Production Dependency
pnpm add package-name

# Dev Dependency
pnpm add -D package-name

# Immer committen:
git add pnpm-lock.yaml
```

### Upgraden

```sh
# Alle Dependencies auf neueste Versionen (YAML erlaubt)
pnpm update

# Spezifisches Package upgraden
pnpm add package-name@latest

# pnpm selbst upgraden
pnpm add -g pnpm@latest
```

### Caching in CI

GitHub Actions nutzt automatisch:
- `cache: pnpm` in `actions/setup-node@v5`
- Cacht `pnpm-lock.yaml` und Module

**Manuell cachen (selten nötig):**
```yaml
- uses: pnpm/action-setup@v5
  with:
    version: 11
    run_install: false

- uses: actions/cache@v4
  with:
    path: ~/.pnpm-store
    key: ${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}
```

## Debugging

### Build-Fehler lokal reproduzieren

```sh
# Frischen Install durchführen
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Build versuchen
pnpm build

# Detaillierte Fehlermeldung
pnpm build --verbose
```

### Vite Debuggen

```sh
# Dev-Server mit Debug-Output
pnpm dev

# Browser DevTools: F12 → Console/Network
```

### Performance-Analyse

```sh
# Build-Zeit analysieren
pnpm build --timing

# Bundle-Analyse
pnpm build && npx vite-bundle-analyzer build/
```

## Deployment

### GitHub Pages (aktuell)

Automatisch via GitHub Actions. Check Status unter:
- GitHub Repo → Actions Tab
- GitHub Repo → Settings → Pages

### Manuelles Deployment

```sh
# Lokal bauen
pnpm build

# Artifacts hochladen (z. B. zu Netlify, Vercel, etc.)
# oder direkt als GitHub Pages deployen
git add build/
git commit -m "Deploy build"
git push
```

## Links & Ressourcen

- [SvelteKit Docs](https://kit.svelte.dev/docs/introduction)
- [Svelte 5 Docs](https://svelte.dev/docs)
- [Vite Docs](https://vitejs.dev/)
- [pnpm Docs](https://pnpm.io/)
- [GitHub Actions](https://github.com/features/actions)

# Copilot instructions for KassenBuddy

## Build, check, and test commands

- Install dependencies: `pnpm install` (CI uses `pnpm install --frozen-lockfile`)
- Dev server: `pnpm dev`
- Production build (web): `pnpm build:web` (alias: `pnpm build`)
- Preview production build: `pnpm preview`
- Android init (one-time): `pnpm android:init`
- Android build prep (separate from web deploy): `pnpm build:android` (`build:web` + `android:sync`)
- Type/lint-style check used in this repo: `pnpm check` (runs `svelte-check`)
- Watch mode for checks: `pnpm check:watch`

There is currently no automated test runner configured (`test` script, Vitest, Jest, Playwright, etc. are not present), so there is no single-test command yet.

## High-level architecture

KassenBuddy is a static, offline-first SvelteKit PWA. The app is split into a POS flow (`src/routes/+page.svelte`) and an admin area (`src/routes/admin/**`) behind a PIN gate in `src/routes/admin/+layout.svelte`.

Persistent data is browser-only and centered in `src/lib/db/index.ts` (IndexedDB via `idb`): products, transactions, and settings. UI routes/components load and mutate data through this DB module, not direct storage calls. Cart state and checkout behavior live in `src/lib/stores/cart.svelte.ts`, which creates transactions, decrements stock, and updates the drink quota counter in settings.

Supporting layers:
- `src/lib/types/index.ts`: domain model + defaults (`DEFAULT_SETTINGS`, categories)
- `src/lib/utils/*`: export/import (XLSX + JSON), backups, image blob handling, formatting, IDs
- `src/lib/components/pos/*` and `src/lib/components/shared/*`: POS/admin UI building blocks

Build/deployment model:
- Static output (`@sveltejs/adapter-static`, `prerender = true`)
- Relative paths enabled (`kit.paths.relative = true`)
- PWA/service worker handled by `@vite-pwa/sveltekit` in `vite.config.ts`
- Capacitor Android packaging uses the same static output via `capacitor.config.ts` (`webDir: 'build'`)
- GitHub Pages deploy from `build/` via `.github/workflows/deploy-pages.yml`

## Key codebase conventions

- Use Svelte 5 runes (`$state`, `$derived`) for local/reactive state across routes/components instead of legacy store patterns.
- Keep all persistent business data access in `$lib/db`; reuse its helpers (`getAllProducts`, `getSettings`, `saveTransaction`, etc.) instead of duplicating DB logic.
- Settings writes/reads should go through DB normalization (`normalizeSettings`, `normalizeQuickDiscountPercents`) to keep backward compatibility and safe defaults.
- Discount handling is modeled as a synthetic cart product (`id` prefix `discount:`) in `cart.svelte.ts`; only one percentage discount is active at a time.
- Product stock uses `null` to mean “unlimited stock”; non-null values are decremented on checkout.
- Internal links and static asset/data fetches should use `$app/paths` (`base`) so the app works under relative/static hosting.
- UI/domain text is German-facing; keep labels/messages consistent with existing German wording.
- Price/date formatting uses locale helpers in `src/lib/utils/currency.ts` (`de-DE` formatting conventions).

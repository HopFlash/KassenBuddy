# Projektweiter Bug- und Stabilitätsreview – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find and surgically fix clearly evidenced bugs and instability in KassenBuddy's offline sales and data lifecycle.

**Architecture:** Review the POS and its connected persistence, import/export, and PWA boundaries as one end-to-end application flow. Reproduce each concrete defect before changing code, add regression coverage where the existing project setup supports it, and keep each fix within the affected flow.

**Tech Stack:** SvelteKit, Svelte 5, TypeScript, IndexedDB (`idb`), Vite PWA, pnpm.

## Global Constraints

- Only reproducible or clearly code-evidenced bugs affecting checkout, data integrity, or stability are in scope.
- Keep fixes minimal and follow existing project patterns.
- Do not include larger refactorings, new features, or speculative hardening.
- Add focused regression coverage with Vitest and fake-indexeddb for database flows and Svelte Testing Library for checkout failure recovery.
- Run `pnpm check` and `pnpm build`; report any environment-blocked check as blocked.
- Preserve behavior outside confirmed bug fixes.

---

### Task 1: Review the connected sales and data lifecycle

**Files:**
- Inspect: `src/routes/+page.svelte`
- Inspect: `src/lib/components/pos/Cart.svelte`
- Inspect: `src/lib/components/pos/CheckoutModal.svelte`
- Inspect: `src/lib/components/pos/CheckoutModalClassic.svelte`
- Inspect: `src/lib/components/pos/ProductGrid.svelte`
- Inspect: `src/lib/stores/cart.svelte.ts`
- Inspect: `src/lib/db/index.ts`
- Inspect: `src/lib/types/index.ts`
- Inspect: `src/lib/utils/backup.ts`
- Inspect: `src/lib/utils/export.ts`
- Inspect: `src/routes/admin/+page.svelte`
- Inspect: `src/routes/admin/statistics/+page.svelte`
- Inspect: `src/routes/admin/settings/+page.svelte`
- Inspect: `vite.config.ts`
- Inspect: `svelte.config.js`
- Inspect: `src/pwa.d.ts`
- Inspect: `static/default.json`
- Check: `package.json` and existing test files for supported test commands

- [x] Trace product selection, cart calculations, discounts, cash/card checkout, and stock updates through their callers and persistence functions.
- [x] Trace transaction and settings reads/writes, backup import/export, transaction import/export, and the PWA offline lifecycle at their boundaries.
- [x] For every suspected defect, identify the triggering input/state, the incorrect outcome, and the responsible code path; exclude findings that cannot be established from code or reproduction.
- [x] Record only confirmed findings with their affected paths and the smallest regression check that demonstrates each failure.

### Task 2: Fix confirmed defects with regression coverage

**Files:**
- Modify: `package.json` to add a `test` script and test-only dependencies.
- Modify: `pnpm-lock.yaml` for the test-only dependencies.
- Create: `vitest.config.ts` using the SvelteKit Vite plugin and a Node test environment.
- Create: `src/test/setup.ts` to install the fake IndexedDB implementation.
- Create: `src/lib/db/index.test.ts` for checkout writes and rollback behavior.
- Create: `src/lib/utils/backup.test.ts` for atomic backup import behavior.
- Create: `src/lib/components/pos/CheckoutModal.test.ts` for failed-payment recovery.
- Modify only source files implicated by a confirmed Task 1 finding.
- Modify: `vite.config.ts` only if needed to precache the default product JSON.

- [x] Add Vitest, fake-indexeddb, jsdom, and Svelte Testing Library as development dependencies, and configure `pnpm test` to run Vitest once.
- [x] Add focused tests that reproduce the confirmed checkout/data-integrity and failed-import behaviors against real IndexedDB semantics and the affected Svelte component.
- [x] Run the new tests before changing production code and confirm each fails for the expected reason.
- [x] Apply the smallest fix that corrects the confirmed failure without changing unrelated behavior.
- [x] Re-run the regression check and confirm that it passes; repeat for each confirmed finding.

### Task 3: Validate the project and report results

**Files:**
- No additional files unless a confirmed defect requires a focused regression test or a directly related documentation correction.

- [x] Run the available focused regression checks from Task 2.
- [x] Run `pnpm check` and confirm it exits successfully.
- [x] Run `pnpm build` and confirm it exits successfully.
- [x] Confirm the generated service worker precaches `default.json` so a fresh offline install can load the default products.
- [x] Review the final diff for unrelated changes and run `git diff --check`.
- [x] Report fixed findings with paths and validation evidence, and separately list any confirmed but unfixed issue or blocked check.

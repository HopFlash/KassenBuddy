# Kassentag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed 00:00–23:59:59 calendar-day billing cutoff with a manually started/stopped
"Kassentag" (till session) that can span midnight, per
`docs/superpowers/specs/2026-09-19-kassentag-design.md`.

**Architecture:** New IndexedDB store `kassentage` (DB version 1 → 2) holds session records
(`startedAt`, `endedAt`, `status`, `source`). `Transaction` gains a required `kassentagId: string | null`
field, indexed via a new `by-kassentag` index on the `transactions` store. A self-healing,
data-driven migration (compares `count('transactions')` vs. `countFromIndex('transactions',
'by-kassentag')`) backfills legacy transactions into synthetic per-calendar-day `Kassentag` records on
every `getDb()` call, so it also covers JSON imports made after startup. The POS blocks checkout
(not cart editing) when no Kassentag is open; the admin area gains a management page; statistics and
exports switch their date-range filter to a Kassentag-based filter.

**Tech Stack:** SvelteKit + Svelte 5 runes, `idb` (IndexedDB wrapper), TypeScript, Tailwind, `xlsx`
(SheetJS) for exports, Vitest, and fake-indexeddb for database tests. Run automated tests and
`pnpm check` for each task; retain the concrete manual verification procedures for browser-only UX.

## Global Constraints

- All persistent data access goes through `src/lib/db/index.ts` — never touch IndexedDB directly
  from components or stores.
- UI copy is German, matching existing tone (e.g. "Warenkorb leeren", "Wirklich löschen?").
- Settings writes/reads go through `normalizeSettings` — unaffected by this feature, do not touch it.
- Product `stock: null` means unlimited — unaffected by this feature.
- Only one Kassentag may have `status: 'open'` at any time (single-active invariant), enforced at
  the DB layer, not just in the UI.
- No custom label per Kassentag; no automatic drink-quota reset per Kassentag; no fixed daily cutoff
  — these are explicitly out of scope per the spec.
- Run `pnpm check` after every task and confirm 0 errors / 0 warnings before committing.
- Follow the existing `git commit` message style seen in this repo's history (concise, imperative,
  no scope prefix required) and include the required `Co-authored-by: Copilot
  <223556219+Copilot@users.noreply.github.com>` trailer.

---

### Task 0: Test infrastructure

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `vite.config.ts`
- Create: a Vitest smoke test using fake IndexedDB

**Interfaces:**
- Produces: a `pnpm test` command and working Vitest configuration for subsequent feature tests.

- [ ] Add Vitest and fake-indexeddb as development dependencies and configure `pnpm test` to run
  Vitest in run mode.
- [ ] Add a smoke test that exercises an actual IndexedDB write/read using fake-indexeddb.
- [ ] Run the smoke test and `pnpm check`, then commit.

---

### Task 1: Data model — `Kassentag` type and `Transaction.kassentagId`

**Files:**
- Modify: `src/lib/types/index.ts:24-31` (the `Transaction` interface)

**Interfaces:**
- Produces: `Kassentag` interface (`id: string; startedAt: number; endedAt: number | null; status:
  'open' | 'closed'; source: 'manual' | 'legacy';`), and `Transaction.kassentagId: string | null`,
  used by every later task.

- [ ] **Step 1: Add the `Kassentag` interface and extend `Transaction`**

In `src/lib/types/index.ts`, add the new interface directly above `Transaction`, and add the new
field to `Transaction`:

```ts
export interface Kassentag {
	id: string;
	startedAt: number;
	endedAt: number | null;
	status: 'open' | 'closed';
	source: 'manual' | 'legacy';
}

export interface Transaction {
	id: string;
	timestamp: number;
	items: TransactionItem[];
	total: number;
	amountPaid: number;
	change: number;
	paymentMethod: 'cash' | 'card';
	kassentagId: string | null;
}
```

- [ ] **Step 2: Verify the project still type-checks (expected failures)**

Run: `pnpm check`
Expected: FAILS — every place that builds a `Transaction` object literal now lacks the required
`kassentagId` field (`src/lib/stores/cart.svelte.ts`, `src/routes/admin/statistics/+page.svelte`).
This is expected; those call sites are fixed in Tasks 6 and 9. Confirm the reported errors are only
about missing `kassentagId`, nothing else.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat(types): add Kassentag type and Transaction.kassentagId field

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: DB schema — `kassentage` store, `by-kassentag` index, DB version bump

**Files:**
- Modify: `src/lib/db/index.ts:5-12` (constants and `KasseDB` type)
- Modify: `src/lib/db/index.ts:75-104` (`getDb()` / `upgrade()`)

**Interfaces:**
- Consumes: `Kassentag` type from Task 1.
- Produces: `KasseDB` type now includes a `kassentage` store; `transactions` store gains a
  `by-kassentag` index (nullable `kassentagId` values are *not* included in this index — this is
  standard IndexedDB behavior and is relied upon by Task 4's migration detection).

- [ ] **Step 1: Update imports and constants**

In `src/lib/db/index.ts`, update the top of the file:

```ts
import { openDB, type IDBPDatabase } from 'idb';
import type { Product, Transaction, Settings, Kassentag } from '$lib/types';
import { DEFAULT_SETTINGS, CATEGORIES } from '$lib/types';
import { generateId } from '$lib/utils/id';
import { startOfDay, endOfDay } from '$lib/utils/currency';

const DB_NAME = 'kasse-db';
const DB_VERSION = 2;

export type KasseDB = IDBPDatabase<{
	products: { key: string; value: Product; indexes: { 'by-category': string } };
	transactions: {
		key: string;
		value: Transaction;
		indexes: { 'by-timestamp': number; 'by-kassentag': string };
	};
	settings: { key: string; value: Settings };
	kassentage: { key: string; value: Kassentag };
}>;
```

(`generateId`/`startOfDay`/`endOfDay` are unused until Task 4, but importing them now avoids a
second edit to the same import block.)

- [ ] **Step 2: Make the `upgrade()` callback version-aware**

Replace the current `upgrade(db)` block inside `getDb()`:

```ts
			upgrade(db) {
				const productStore = db.createObjectStore('products', { keyPath: 'id' });
				productStore.createIndex('by-category', 'category');

				const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
				txStore.createIndex('by-timestamp', 'timestamp');

				db.createObjectStore('settings');
			}
```

with:

```ts
			upgrade(db, oldVersion, _newVersion, transaction) {
				if (oldVersion < 1) {
					const productStore = db.createObjectStore('products', { keyPath: 'id' });
					productStore.createIndex('by-category', 'category');

					const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
					txStore.createIndex('by-timestamp', 'timestamp');

					db.createObjectStore('settings');
				}

				if (oldVersion < 2) {
					db.createObjectStore('kassentage', { keyPath: 'id' });

					const txStore = transaction.objectStore('transactions');
					txStore.createIndex('by-kassentag', 'kassentagId');
				}
			}
```

This guards each store/index creation by `oldVersion` so existing installs upgrading from version 1
don't hit a `ConstraintError` from re-creating `products`/`transactions`/`settings`, while fresh
installs (`oldVersion === 0`) still get everything created in one pass.

- [ ] **Step 3: Run `pnpm check`**

Run: `pnpm check`
Expected: The only remaining errors are the `kassentagId`-missing-field errors from Task 1 Step 2
(in `cart.svelte.ts` and the statistics page) — no new errors from `db/index.ts`.

- [ ] **Step 4: Manual verification — schema upgrade doesn't break existing data**

1. Run `pnpm dev`, open the app in a browser, add at least one product sale so a transaction exists
   (checkout will still fail at this point since Task 6 isn't done yet — if `commitCheckout` throws
   because of the type change, that's expected; instead just confirm the app loads without console
   errors related to `kassentage`).
2. Open DevTools → Application → IndexedDB → `kasse-db`. Confirm object stores are: `products`,
   `transactions`, `settings`, `kassentage`, and that the DB version shown is `2`.
3. Confirm no `ConstraintError` or `VersionError` appears in the console.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "feat(db): bump schema to v2, add kassentage store and by-kassentag index

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Legacy data migration (self-healing)

**Files:**
- Modify: `src/lib/db/index.ts` (inside `getDb()`, plus one new module-level function)

**Interfaces:**
- Consumes: `KasseDB` from Task 2, `generateId()` from `$lib/utils/id`, `startOfDay`/`endOfDay` from
  `$lib/utils/currency`.
- Produces: transactions written before this feature (or imported later without a `kassentagId`)
  end up grouped into `Kassentag` records with `source: 'legacy'`, `status: 'closed'`, one per
  calendar day (local time), covering the whole day (`startOfDay`–`endOfDay`).

- [ ] **Step 1: Add a local-day grouping helper and the migration function**

Add this above `export async function getDb()`:

```ts
let migrationPromise: Promise<void> | null = null;

function localDayKey(timestamp: number): string {
	const d = new Date(timestamp);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

async function runLegacyMigration(db: KasseDB): Promise<void> {
	const totalCount = await db.count('transactions');
	if (totalCount === 0) return;

	const assignedCount = await db.countFromIndex('transactions', 'by-kassentag');
	if (assignedCount >= totalCount) return;

	const allTransactions = await db.getAll('transactions');
	const unassigned = allTransactions.filter((tx) => tx.kassentagId == null);
	if (unassigned.length === 0) return;

	const byDay = new Map<string, Transaction[]>();
	for (const tx of unassigned) {
		const key = localDayKey(tx.timestamp);
		const group = byDay.get(key);
		if (group) group.push(tx);
		else byDay.set(key, [tx]);
	}

	const existingKassentage = await db.getAll('kassentage');
	const idbTx = db.transaction(['transactions', 'kassentage'], 'readwrite');
	const txStore = idbTx.objectStore('transactions');
	const kassentagStore = idbTx.objectStore('kassentage');
	const writes: Promise<unknown>[] = [];

	for (const dayTransactions of byDay.values()) {
		const reference = new Date(dayTransactions[0].timestamp);
		const start = startOfDay(reference);
		const end = endOfDay(reference);

		let kassentag = existingKassentage.find(
			(k) => k.source === 'legacy' && k.startedAt === start && k.endedAt === end
		);
		if (!kassentag) {
			kassentag = { id: generateId(), startedAt: start, endedAt: end, status: 'closed', source: 'legacy' };
			existingKassentage.push(kassentag);
			writes.push(kassentagStore.put(kassentag));
		}

		for (const tx of dayTransactions) {
			writes.push(txStore.put({ ...tx, kassentagId: kassentag.id }));
		}
	}

	await Promise.all(writes);
	await idbTx.done;
}

/**
 * Data-driven, self-healing legacy migration: cheaply checks (two count queries, no
 * full scan) whether any transactions lack a kassentagId, and if so backfills them into
 * synthetic per-calendar-day Kassentag records. Runs on every getDb() call (not just cold
 * init) so it also catches transactions imported later via JSON import. Concurrent calls
 * share one in-flight run via migrationPromise, mirroring the dbInitPromise pattern above,
 * to avoid two callers both deciding to create the same day's legacy Kassentag.
 */
async function migrateLegacyTransactionsIfNeeded(db: KasseDB): Promise<void> {
	if (migrationPromise) {
		await migrationPromise;
		return;
	}
	migrationPromise = runLegacyMigration(db);
	try {
		await migrationPromise;
	} finally {
		migrationPromise = null;
	}
}
```

- [ ] **Step 2: Call the migration from every `getDb()` call**

Rename the existing `getDb` body to an internal `ensureDb`, and make `getDb` call the migration
after the instance is ready. Replace:

```ts
export async function getDb(): Promise<KasseDB> {
	if (dbInstance) return dbInstance;
	if (dbInitPromise) return dbInitPromise;

	dbInitPromise = (async () => {
		const db = (await openDB(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, transaction) {
				...
			}
		})) as unknown as KasseDB;

		// Initialize default settings if not present
		const settings = await db.get('settings', 'main');
		if (!settings) {
			await db.put('settings', DEFAULT_SETTINGS, 'main');
		}

		// Load default products on fresh install
		const productCount = await db.count('products');
		if (productCount === 0) {
			await loadDefaults(db);
		}

		dbInstance = db;
		return db;
	})();

	try {
		return await dbInitPromise;
	} finally {
		dbInitPromise = null;
	}
}
```

with:

```ts
export async function getDb(): Promise<KasseDB> {
	const db = await ensureDb();
	await migrateLegacyTransactionsIfNeeded(db);
	return db;
}

async function ensureDb(): Promise<KasseDB> {
	if (dbInstance) return dbInstance;
	if (dbInitPromise) return dbInitPromise;

	dbInitPromise = (async () => {
		const db = (await openDB(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, transaction) {
				if (oldVersion < 1) {
					const productStore = db.createObjectStore('products', { keyPath: 'id' });
					productStore.createIndex('by-category', 'category');

					const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
					txStore.createIndex('by-timestamp', 'timestamp');

					db.createObjectStore('settings');
				}

				if (oldVersion < 2) {
					db.createObjectStore('kassentage', { keyPath: 'id' });

					const txStore = transaction.objectStore('transactions');
					txStore.createIndex('by-kassentag', 'kassentagId');
				}
			}
		})) as unknown as KasseDB;

		// Initialize default settings if not present
		const settings = await db.get('settings', 'main');
		if (!settings) {
			await db.put('settings', DEFAULT_SETTINGS, 'main');
		}

		// Load default products on fresh install
		const productCount = await db.count('products');
		if (productCount === 0) {
			await loadDefaults(db);
		}

		dbInstance = db;
		return db;
	})();

	try {
		return await dbInitPromise;
	} finally {
		dbInitPromise = null;
	}
}
```

(Note: this keeps the existing "upgrade" body intact — Task 2 already left it in this
version-guarded shape, this step only wraps it with the new `ensureDb`/migration split.)

- [ ] **Step 3: Run `pnpm check`**

Run: `pnpm check`
Expected: no new errors introduced by this task (the pre-existing `kassentagId`-missing errors from
Task 1 remain until Tasks 6/9).

- [ ] **Step 4: Manual verification — legacy migration runs and is idempotent**

1. In DevTools → Application → IndexedDB, delete the `kasse-db` database entirely to start clean.
2. Use the app's existing Statistik → "+ Neue Transaktion" flow twice, once now and — using the
   datetime field — once with a timestamp from yesterday, to create two transactions on different
   calendar days.
3. Reload the page. Open DevTools → Application → IndexedDB → `kasse-db` → `kassentage`. Confirm
   two records exist with `source: 'legacy'`, `status: 'closed'`, one per calendar day, and that
   both seeded transactions in the `transactions` store now have a matching `kassentagId`.
4. Reload the page again. Confirm no *new* `kassentage` records are created (the migration is a
   no-op once `assignedCount >= totalCount`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "feat(db): self-healing legacy transaction migration into Kassentag records

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Kassentag CRUD functions

**Files:**
- Modify: `src/lib/db/index.ts` (append new exported functions near the end of the "Transactions"
  section, before "Settings")

**Interfaces:**
- Consumes: `Kassentag` type (Task 1), `KasseDB` (Task 2), `generateId()`.
- Produces (used by Tasks 5–9):
  - `getActiveKassentag(): Promise<Kassentag | null>`
  - `startKassentag(): Promise<Kassentag>` — throws `Error('Es läuft bereits ein Kassentag')` if one
    is already open.
  - `endKassentag(id: string): Promise<void>`
  - `getAllKassentage(): Promise<Kassentag[]>` — sorted by `startedAt` descending.
  - `updateKassentagTimes(id: string, startedAt: number, endedAt: number | null): Promise<void>` —
    throws on `startedAt >= endedAt` (when `endedAt` set) or on reopening while another Kassentag is
    already open.
  - `getTransactionsByKassentag(id: string): Promise<Transaction[]>` — sorted by `timestamp`
    descending.
  - `findKassentagForTimestamp(timestamp: number): Promise<Kassentag | null>`

- [ ] **Step 1: Add the functions**

Add this new section to `src/lib/db/index.ts`, directly after `deleteTransaction` and before
`// --- Settings ---`:

```ts
// --- Kassentage ---

export async function getActiveKassentag(): Promise<Kassentag | null> {
	const db = await getDb();
	const all = await db.getAll('kassentage');
	return all.find((k) => k.status === 'open') ?? null;
}

/**
 * Starts a new Kassentag. The open-check and the write happen inside a single IndexedDB
 * readwrite transaction on the `kassentage` store; IndexedDB serializes readwrite
 * transactions on the same store even across browser tabs, so a second tab calling this
 * concurrently will see the first tab's committed write and correctly throw instead of
 * creating a second open Kassentag.
 */
export async function startKassentag(): Promise<Kassentag> {
	const db = await getDb();
	const idbTx = db.transaction('kassentage', 'readwrite');
	const store = idbTx.store;
	const all = await store.getAll();
	if (all.some((k) => k.status === 'open')) {
		throw new Error('Es läuft bereits ein Kassentag');
	}
	const kassentag: Kassentag = {
		id: generateId(),
		startedAt: Date.now(),
		endedAt: null,
		status: 'open',
		source: 'manual'
	};
	await store.put(kassentag);
	await idbTx.done;
	return kassentag;
}

export async function endKassentag(id: string): Promise<void> {
	const db = await getDb();
	const kassentag = await db.get('kassentage', id);
	if (!kassentag) {
		throw new Error('Kassentag nicht gefunden');
	}
	await db.put('kassentage', { ...kassentag, endedAt: Date.now(), status: 'closed' });
}

export async function getAllKassentage(): Promise<Kassentag[]> {
	const db = await getDb();
	const all = await db.getAll('kassentage');
	return all.sort((a, b) => b.startedAt - a.startedAt);
}

export async function updateKassentagTimes(
	id: string,
	startedAt: number,
	endedAt: number | null
): Promise<void> {
	if (endedAt !== null && startedAt >= endedAt) {
		throw new Error('Startzeit muss vor der Endzeit liegen');
	}

	const db = await getDb();
	const kassentag = await db.get('kassentage', id);
	if (!kassentag) {
		throw new Error('Kassentag nicht gefunden');
	}

	if (endedAt === null) {
		const active = await getActiveKassentag();
		if (active && active.id !== id) {
			throw new Error('Es läuft bereits ein anderer Kassentag');
		}
	}

	await db.put('kassentage', {
		...kassentag,
		startedAt,
		endedAt,
		status: endedAt === null ? 'open' : 'closed'
	});
}

export async function getTransactionsByKassentag(id: string): Promise<Transaction[]> {
	const db = await getDb();
	const txs = await db.getAllFromIndex('transactions', 'by-kassentag', id);
	return txs.sort((a, b) => b.timestamp - a.timestamp);
}

export async function findKassentagForTimestamp(timestamp: number): Promise<Kassentag | null> {
	const all = await getAllKassentage();
	return (
		all.find((k) => {
			const end = k.endedAt ?? Number.POSITIVE_INFINITY;
			return timestamp >= k.startedAt && timestamp <= end;
		}) ?? null
	);
}
```

- [ ] **Step 2: Run `pnpm check`**

Run: `pnpm check`
Expected: no new errors from `db/index.ts` (pre-existing `kassentagId` errors in `cart.svelte.ts`/
statistics page remain, fixed in Tasks 6/9).

- [ ] **Step 3: Manual verification — CRUD behavior**

Full console-level testing of these functions is impractical without app UI to call them from. Skip
deep console testing here and instead confirm via `pnpm check` cleanliness; end-to-end verification
of `startKassentag`/`endKassentag`/`getActiveKassentag` happens in Task 6 Step 4 and Task 7 Step 6
once the POS UI wires them up, and `getAllKassentage`/`updateKassentagTimes` are verified in Task 8
Step 5, and `getTransactionsByKassentag`/`findKassentagForTimestamp` in Task 9/10.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/index.ts
git commit -m "feat(db): add Kassentag CRUD functions (start/end/list/update/find)

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Kassentag display formatting utility

**Files:**
- Create: `src/lib/utils/kassentag.ts`

**Interfaces:**
- Consumes: `Kassentag` type (Task 1), `formatDate()` from `$lib/utils/currency`.
- Produces:
  - `formatKassentagLabel(kassentag: Kassentag): string` — e.g. `"Kassentag 20.09.2026, 20:14 Uhr"`,
    or with `" · läuft noch"` appended when `status === 'open'`. Used by the POS header (Task 6) and
    the admin list (Task 8).
  - `formatKassentagRange(kassentag: Kassentag): string` — e.g. `"20.09.2026, 20:14 – 21.09.2026,
    03:40"`, or `"20.09.2026, 20:14 – läuft noch"` when open. Used by the statistics dropdown (Task
    9) and export labeling (Task 10).

- [ ] **Step 1: Create the file**

```ts
import type { Kassentag } from '$lib/types';
import { formatDate } from './currency';

export function formatKassentagLabel(kassentag: Kassentag): string {
	const suffix = kassentag.status === 'open' ? ' Uhr · läuft noch' : ' Uhr';
	return `Kassentag ${formatDate(kassentag.startedAt)}${suffix}`;
}

export function formatKassentagRange(kassentag: Kassentag): string {
	const start = formatDate(kassentag.startedAt);
	const end = kassentag.endedAt === null ? 'läuft noch' : formatDate(kassentag.endedAt);
	return `${start} – ${end}`;
}
```

- [ ] **Step 2: Run `pnpm check`**

Run: `pnpm check`
Expected: no new errors (this is a standalone new file with no other consumers yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/utils/kassentag.ts
git commit -m "feat(utils): add Kassentag display formatting helpers

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Checkout integration — cart writes `kassentagId`

**Files:**
- Modify: `src/lib/stores/cart.svelte.ts:1-3` (imports)
- Modify: `src/lib/stores/cart.svelte.ts` (`checkout()` method, near the end of the file)

**Interfaces:**
- Consumes: `getActiveKassentag()` (Task 4).
- Produces: every `Transaction` written via `cart.checkout()` now carries the currently active
  Kassentag's `id`, or `null` if none is active (the POS UI, wired in Task 7, prevents reaching
  checkout with no active Kassentag, but `checkout()` itself must not assume that invariant blindly
  — it degrades to `null` rather than throwing, since defense-in-depth here is cheap and the UI is
  the actual enforcement point).

- [ ] **Step 1: Update the import**

In `src/lib/stores/cart.svelte.ts`, replace:

```ts
import { getSettings, commitCheckout } from '$lib/db';
```

with:

```ts
import { getSettings, commitCheckout, getActiveKassentag } from '$lib/db';
```

- [ ] **Step 2: Set `kassentagId` on the built transaction**

Replace the `checkout()` method's `tx` construction:

```ts
		const tx: Transaction = {
			id: generateId(),
			timestamp: Date.now(),
			items: txItems,
			total,
			amountPaid,
			change: Math.round((amountPaid - total) * 100) / 100,
			paymentMethod
		};
```

with:

```ts
		const activeKassentag = await getActiveKassentag();

		const tx: Transaction = {
			id: generateId(),
			timestamp: Date.now(),
			items: txItems,
			total,
			amountPaid,
			change: Math.round((amountPaid - total) * 100) / 100,
			paymentMethod,
			kassentagId: activeKassentag?.id ?? null
		};
```

- [ ] **Step 3: Run `pnpm check`**

Run: `pnpm check`
Expected: the `kassentagId`-missing error in `cart.svelte.ts` is gone; only the statistics page
error (fixed in Task 9) remains.

- [ ] **Step 4: Manual verification — checkout assigns the active Kassentag**

1. Run `pnpm dev`. In DevTools → Application → IndexedDB → `kasse-db`, manually verify there is no
   open Kassentag yet.
2. In the browser console, run:
   ```js
   const dbMod = await import('/src/lib/db/index.ts');
   const k = await dbMod.startKassentag();
   console.log(k);
   ```
   Confirm a record with `status: 'open'` is logged and appears in the `kassentage` store.
3. In the POS UI, add a product to the cart and complete a checkout (cash).
4. In DevTools → Application → IndexedDB → `transactions`, find the new transaction and confirm its
   `kassentagId` matches the `id` logged in step 2.
5. In the console, run `await dbMod.startKassentag()` again — confirm it throws
   `Error: Es läuft bereits ein Kassentag` (single-active invariant holds).
6. Clean up: run `await dbMod.endKassentag(k.id)` in the console so later tasks start from a clean
   "no active Kassentag" state.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/cart.svelte.ts
git commit -m "feat(cart): assign active Kassentag id to checkout transactions

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: POS UI — start/stop control and checkout gating

**Files:**
- Modify: `src/lib/components/pos/Cart.svelte` (props + "Bezahlen" button)
- Modify: `src/routes/+page.svelte` (header + state)

**Interfaces:**
- Consumes: `getActiveKassentag`, `startKassentag`, `endKassentag` (Task 4),
  `formatKassentagLabel` (Task 5).
- Produces: `Cart.svelte` gains a new required prop `kassentagActive: boolean`; `+page.svelte` holds
  the `activeKassentag` state and passes `kassentagActive={!!activeKassentag}` down.

- [ ] **Step 1: Update `Cart.svelte`'s props and "Bezahlen" button**

In `src/lib/components/pos/Cart.svelte`, replace the `Props` interface and destructuring:

```ts
	interface Props {
		oncheckout: () => void;
	}

	let { oncheckout }: Props = $props();
```

with:

```ts
	interface Props {
		oncheckout: () => void;
		kassentagActive: boolean;
	}

	let { oncheckout, kassentagActive }: Props = $props();
```

Then replace the "Bezahlen" button block:

```svelte
		<button
			type="button"
			class="w-full bg-success hover:bg-success/80 active:bg-success/60 text-white rounded-xl min-h-12 py-4 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
			disabled={cart.items.length === 0}
			onclick={oncheckout}
		>
			Bezahlen
		</button>
```

with:

```svelte
		<button
			type="button"
			class="w-full bg-success hover:bg-success/80 active:bg-success/60 text-white rounded-xl min-h-12 py-4 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
			disabled={cart.items.length === 0 || !kassentagActive}
			onclick={oncheckout}
		>
			Bezahlen
		</button>

		{#if !kassentagActive}
			<p class="text-center text-xs text-warning">Bitte zuerst Kassentag starten</p>
		{/if}
```

- [ ] **Step 2: Run `pnpm check`**

Run: `pnpm check`
Expected: FAILS — `src/routes/+page.svelte` doesn't pass `kassentagActive` to `<Cart>` yet. Confirm
the only new error is that missing prop; fixed in Step 3 below.

- [ ] **Step 3: Add Kassentag state and header controls to `+page.svelte`**

In `src/routes/+page.svelte`, update the imports:

```ts
	import { getActiveProducts, getSettings } from '$lib/db';
```

to:

```ts
	import { getActiveProducts, getSettings, getActiveKassentag, startKassentag, endKassentag } from '$lib/db';
	import type { Kassentag } from '$lib/types';
	import { formatKassentagLabel } from '$lib/utils/kassentag';
```

Add new state below the existing `let checkoutLayout = ...` line:

```ts
	let activeKassentag = $state<Kassentag | null>(null);
	let confirmEndKassentag = $state(false);
	let kassentagError = $state('');
```

Update `onMount` to also fetch the active Kassentag:

```ts
	onMount(async () => {
		const [activeProducts, settings, kassentag] = await Promise.all([
			getActiveProducts(),
			getSettings(),
			getActiveKassentag()
		]);
		products = activeProducts;
		drinkQuotaCounter = settings.drinkQuotaCounter;
		checkoutLayout = settings.checkoutLayout;
		activeKassentag = kassentag;
	});
```

Add two new handler functions after `handleSelect`:

```ts
	async function handleStartKassentag() {
		kassentagError = '';
		try {
			activeKassentag = await startKassentag();
		} catch (e) {
			kassentagError = e instanceof Error ? e.message : 'Kassentag konnte nicht gestartet werden';
		}
	}

	async function handleEndKassentag() {
		if (!activeKassentag) return;
		if (!confirmEndKassentag) {
			confirmEndKassentag = true;
			setTimeout(() => (confirmEndKassentag = false), 3000);
			return;
		}
		await endKassentag(activeKassentag.id);
		activeKassentag = null;
		confirmEndKassentag = false;
	}
```

- [ ] **Step 4: Add the header UI and wire the `Cart` prop**

Replace the header's inner `<div class="flex items-center gap-2">...</div>` block:

```svelte
			<div class="flex items-center gap-2">
				<div class="rounded-xl px-3 py-2 text-sm font-bold {quotaCounterClass}" title="Verbleibendes Getränke-Kontingent">
					Kontingent: {drinkQuotaCounter}
				</div>
				<button
					type="button"
					class="bg-surface-light hover:bg-surface-lighter rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
					onclick={() => (calculatorOpen = true)}
				>
					🧮 Rechner
				</button>
				<a
					href="{base}/admin"
					class="bg-surface-light hover:bg-surface-lighter rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
				>
					⚙️ Admin
				</a>
			</div>
```

with:

```svelte
			<div class="flex items-center gap-2 flex-wrap justify-end">
				{#if activeKassentag}
					<div class="rounded-xl px-3 py-2 text-sm font-semibold bg-success/20 text-success" title="Aktiver Kassentag">
						🟢 {formatKassentagLabel(activeKassentag)}
					</div>
					<button
						type="button"
						class="bg-surface-light hover:bg-danger/20 text-danger rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
						onclick={handleEndKassentag}
					>
						{confirmEndKassentag ? 'Wirklich beenden?' : 'Kassentag beenden'}
					</button>
				{:else}
					<button
						type="button"
						class="bg-accent hover:bg-accent-hover text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
						onclick={handleStartKassentag}
					>
						▶️ Kassentag starten
					</button>
				{/if}
				{#if kassentagError}
					<span class="text-xs text-danger">{kassentagError}</span>
				{/if}
				<div class="rounded-xl px-3 py-2 text-sm font-bold {quotaCounterClass}" title="Verbleibendes Getränke-Kontingent">
					Kontingent: {drinkQuotaCounter}
				</div>
				<button
					type="button"
					class="bg-surface-light hover:bg-surface-lighter rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
					onclick={() => (calculatorOpen = true)}
				>
					🧮 Rechner
				</button>
				<a
					href="{base}/admin"
					class="bg-surface-light hover:bg-surface-lighter rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
				>
					⚙️ Admin
				</a>
			</div>
```

Then update `<Cart oncheckout={() => (checkoutOpen = true)} />` to:

```svelte
		<Cart oncheckout={() => (checkoutOpen = true)} kassentagActive={!!activeKassentag} />
```

- [ ] **Step 5: Run `pnpm check`**

Run: `pnpm check`
Expected: 0 errors, 0 warnings related to this task (the `kassentagId`-missing error in the
statistics page remains, fixed in Task 9).

- [ ] **Step 6: Manual verification — full POS start/stop/checkout flow**

1. Run `pnpm dev`, open the POS page. Confirm the header shows "▶️ Kassentag starten" and the
   "Bezahlen" button is disabled with the hint "Bitte zuerst Kassentag starten" once an item is in
   the cart.
2. Click "▶️ Kassentag starten". Confirm the header now shows "🟢 Kassentag <today's date>, <time>
   Uhr" and a "Kassentag beenden" button.
3. Add a product to the cart, confirm "Bezahlen" is now enabled, and complete a checkout.
4. Click "Kassentag beenden" once — confirm it shows "Wirklich beenden?" — click again to confirm.
   Confirm the header reverts to "▶️ Kassentag starten" and "Bezahlen" becomes disabled again for
   any new cart items.
5. Reload the page — confirm the "no active Kassentag" state persists (i.e. it wasn't just local
   component state, but read from IndexedDB via `getActiveKassentag()`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/pos/Cart.svelte src/routes/+page.svelte
git commit -m "feat(pos): add Kassentag start/stop control and gate checkout on it

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 8: Admin — Kassentage management page

**Files:**
- Create: `src/routes/admin/kassentage/+page.svelte`
- Modify: `src/routes/admin/+layout.svelte` (sidebar nav)

**Interfaces:**
- Consumes: `getAllKassentage`, `updateKassentagTimes`, `getAllTransactions` (existing), `Kassentag`/
  `Transaction` types, `formatDate`/`formatCurrency` (`$lib/utils/currency`), `Modal.svelte`.
- Produces: a new admin route at `/admin/kassentage` listing all Kassentage with an edit modal for
  correcting start/end times (including the currently open one).

- [ ] **Step 1: Add the sidebar link**

In `src/routes/admin/+layout.svelte`, insert a new nav link directly after the "📊 Übersicht" link
and before "📦 Produkte":

```svelte
				<a
					href="{base}/admin"
					class="px-4 py-3 rounded-xl hover:bg-surface-lighter transition-colors text-sm font-semibold"
				>
					📊 Übersicht
				</a>
				<a
					href="{base}/admin/kassentage"
					class="px-4 py-3 rounded-xl hover:bg-surface-lighter transition-colors text-sm font-semibold"
				>
					📅 Kassentage
				</a>
				<a
					href="{base}/admin/products"
```

(This replaces the two-line sequence "Übersicht" link followed immediately by "Produkte" link with
the same two links plus the new one in between.)

- [ ] **Step 2: Run `pnpm check`**

Run: `pnpm check`
Expected: no new errors (the link references a route created in Step 3 below; SvelteKit doesn't
type-check `href` targets, so this alone won't fail).

- [ ] **Step 3: Create the Kassentage admin page**

Create `src/routes/admin/kassentage/+page.svelte`:

```svelte
<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllKassentage, getAllTransactions, updateKassentagTimes } from '$lib/db';
	import type { Kassentag, Transaction } from '$lib/types';
	import { formatDate, formatCurrency } from '$lib/utils/currency';
	import Modal from '$lib/components/shared/Modal.svelte';

	let kassentage = $state<Kassentag[]>([]);
	let transactions = $state<Transaction[]>([]);

	const statsByKassentag = $derived.by(() => {
		const map = new Map<string, { count: number; revenue: number }>();
		for (const tx of transactions) {
			if (!tx.kassentagId) continue;
			const entry = map.get(tx.kassentagId) ?? { count: 0, revenue: 0 };
			entry.count += 1;
			entry.revenue += tx.total;
			map.set(tx.kassentagId, entry);
		}
		return map;
	});

	function durationLabel(k: Kassentag): string {
		const end = k.endedAt ?? Date.now();
		const minutes = Math.max(0, Math.round((end - k.startedAt) / 60000));
		const hours = Math.floor(minutes / 60);
		const rest = minutes % 60;
		return `${hours}h ${rest}min`;
	}

	async function load() {
		[kassentage, transactions] = await Promise.all([getAllKassentage(), getAllTransactions()]);
	}

	onMount(load);

	// --- Edit modal ---
	let editOpen = $state(false);
	let editId = $state('');
	let editStart = $state('');
	let editEnd = $state('');
	let editIsOpenEnd = $state(false);
	let editError = $state('');
	let editSaving = $state(false);

	function toLocalInputValue(timestamp: number): string {
		const d = new Date(timestamp);
		d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
		return d.toISOString().slice(0, 16);
	}

	function openEdit(k: Kassentag) {
		editId = k.id;
		editStart = toLocalInputValue(k.startedAt);
		editIsOpenEnd = k.endedAt === null;
		editEnd = k.endedAt !== null ? toLocalInputValue(k.endedAt) : '';
		editError = '';
		editOpen = true;
	}

	async function saveEdit() {
		editError = '';
		editSaving = true;
		try {
			const startedAt = new Date(editStart).getTime();
			const endedAt = editIsOpenEnd ? null : new Date(editEnd).getTime();
			await updateKassentagTimes(editId, startedAt, endedAt);
			editOpen = false;
			await load();
		} catch (e) {
			editError = e instanceof Error ? e.message : 'Speichern fehlgeschlagen';
		} finally {
			editSaving = false;
		}
	}
</script>

<h1 class="text-2xl font-bold mb-6">Kassentage</h1>

<div class="bg-surface-light rounded-xl p-4 sm:p-6">
	<div class="space-y-2">
		{#each kassentage as k (k.id)}
			{@const stats = statsByKassentag.get(k.id) ?? { count: 0, revenue: 0 }}
			<div class="bg-surface-lighter rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
				<div class="flex-1 min-w-0">
					<p class="font-semibold text-sm">
						{formatDate(k.startedAt)} – {k.endedAt === null ? 'läuft noch' : formatDate(k.endedAt)}
						{#if k.status === 'open'}
							<span class="text-success">🟢</span>
						{/if}
					</p>
					<p class="text-xs text-text-muted">
						Dauer: {durationLabel(k)} · {stats.count} Transaktionen · {formatCurrency(stats.revenue)}
						{#if k.source === 'legacy'}
							<span class="ml-1 text-text-muted">(migriert)</span>
						{/if}
					</p>
				</div>
				<button
					type="button"
					class="px-3 py-2 rounded-lg bg-surface hover:bg-accent/20 text-sm font-semibold transition-colors self-start sm:self-auto"
					onclick={() => openEdit(k)}
				>
					Bearbeiten
				</button>
			</div>
		{:else}
			<p class="text-sm text-text-muted">Noch keine Kassentage vorhanden</p>
		{/each}
	</div>
</div>

<Modal open={editOpen} onclose={() => (editOpen = false)} title="Kassentag bearbeiten">
	<div class="space-y-4">
		<div>
			<label class="block text-sm text-text-muted mb-1" for="edit-start">Start</label>
			<input
				id="edit-start"
				type="datetime-local"
				class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent w-full"
				bind:value={editStart}
			/>
		</div>

		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={editIsOpenEnd} />
			Läuft noch (kein Ende)
		</label>

		{#if !editIsOpenEnd}
			<div>
				<label class="block text-sm text-text-muted mb-1" for="edit-end">Ende</label>
				<input
					id="edit-end"
					type="datetime-local"
					class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent w-full"
					bind:value={editEnd}
				/>
			</div>
		{/if}

		{#if editError}
			<p class="text-danger text-sm">{editError}</p>
		{/if}

		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="bg-surface-lighter hover:bg-surface-lighter/80 text-text-muted rounded-lg px-6 py-2 font-semibold transition-colors"
				onclick={() => (editOpen = false)}
			>
				Abbrechen
			</button>
			<button
				type="button"
				class="bg-accent hover:bg-accent-hover text-white rounded-lg px-6 py-2 font-semibold transition-colors disabled:opacity-50"
				onclick={saveEdit}
				disabled={editSaving}
			>
				{editSaving ? 'Speichern…' : 'Speichern'}
			</button>
		</div>
	</div>
</Modal>
```

- [ ] **Step 4: Run `pnpm check`**

Run: `pnpm check`
Expected: 0 errors, 0 warnings from this task.

- [ ] **Step 5: Manual verification**

1. Run `pnpm dev`, log into `/admin` with the PIN, click "📅 Kassentage" in the sidebar.
2. Confirm the list shows every Kassentag created in Tasks 6–7's manual testing (including the
   legacy one from Task 3's manual test, labeled "(migriert)").
3. Click "Bearbeiten" on any closed Kassentag, change the start time to an hour earlier, save.
   Confirm the row updates and the duration recalculates.
4. Start a new Kassentag from the POS page, then edit it from this admin page (checkbox "Läuft
   noch" ticked) — change its start time, save, and confirm it stays open.
5. While that Kassentag is still open, open a *different, closed* Kassentag's edit modal, tick
   "Läuft noch (kein Ende)", and click Save. Confirm it shows the error "Es läuft bereits ein
   anderer Kassentag" and does not save (single-active invariant enforced from this page too).
6. End the currently open Kassentag from the POS page to leave a clean state for later tasks.

- [ ] **Step 6: Commit**

```bash
git add src/routes/admin/kassentage/+page.svelte src/routes/admin/+layout.svelte
git commit -m "feat(admin): add Kassentage management page with edit modal

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Statistics page — Kassentag filter + auto-assignment in the transaction modal

**Files:**
- Modify: `src/routes/admin/statistics/+page.svelte`

**Interfaces:**
- Consumes: `getAllKassentage`, `getTransactionsByKassentag`, `findKassentagForTimestamp` (Task 4),
  `formatKassentagRange` (Task 5), `Kassentag` type (Task 1).
- Produces: the Von/Bis date-range filter is replaced by a Kassentag dropdown; manually
  created/edited transactions get `kassentagId` auto-assigned from their timestamp.

- [ ] **Step 1: Update imports**

Replace:

```ts
	import { getAllTransactions, getTransactionsByDateRange, deleteAllTransactions, saveTransaction, deleteTransaction, getSettings } from '$lib/db';
	import { formatCurrency, formatDate, formatDateShort, startOfDay, endOfDay } from '$lib/utils/currency';
	import { exportTransactionsToXlsx, exportProductSummaryToXlsx, exportTransactionsToJson, parseTransactionsJson } from '$lib/utils/export';
	import type { Transaction, TransactionItem } from '$lib/types';
	import { generateId } from '$lib/utils/id';
	import StatCard from '$lib/components/shared/StatCard.svelte';
```

with:

```ts
	import {
		getAllTransactions,
		getAllKassentage,
		getTransactionsByKassentag,
		findKassentagForTimestamp,
		deleteAllTransactions,
		saveTransaction,
		deleteTransaction,
		getSettings
	} from '$lib/db';
	import { formatCurrency, formatDate } from '$lib/utils/currency';
	import { formatKassentagRange } from '$lib/utils/kassentag';
	import { exportTransactionsToXlsx, exportProductSummaryToXlsx, exportTransactionsToJson, parseTransactionsJson } from '$lib/utils/export';
	import type { Transaction, TransactionItem, Kassentag } from '$lib/types';
	import { generateId } from '$lib/utils/id';
	import StatCard from '$lib/components/shared/StatCard.svelte';
```

(`formatDateShort`, `startOfDay`, `endOfDay` were only used by the date-range filter being removed;
`formatDateShort` was in fact already unused in this file before this change.)

- [ ] **Step 2: Replace the date-range filter state with Kassentag-dropdown state**

Replace:

```ts
	let transactions = $state<Transaction[]>([]);
	let shopName = $state('KassenBuddy');
	let dateFrom = $state(new Date().toISOString().slice(0, 10));
	let dateTo = $state(new Date().toISOString().slice(0, 10));
	let filterActive = $state(false);
	let confirmClear = $state(false);
```

with:

```ts
	let transactions = $state<Transaction[]>([]);
	let shopName = $state('KassenBuddy');
	let kassentageList = $state<Kassentag[]>([]);
	let selectedKassentagId = $state('all');
	let filterActive = $state(false);
	let confirmClear = $state(false);

	const selectedKassentag = $derived(
		selectedKassentagId === 'all' ? null : (kassentageList.find((k) => k.id === selectedKassentagId) ?? null)
	);
```

- [ ] **Step 3: Rewrite the loading/filtering functions**

Replace:

```ts
	onMount(async () => {
		const settings = await getSettings();
		shopName = settings.shopName;
		await loadAll();
	});

	async function loadAll() {
		filterActive = false;
		transactions = await getAllTransactions();
	}

	async function applyFilter() {
		const from = startOfDay(new Date(dateFrom));
		const to = endOfDay(new Date(dateTo));
		transactions = await getTransactionsByDateRange(from, to);
		filterActive = true;
	}
```

with:

```ts
	onMount(async () => {
		const settings = await getSettings();
		shopName = settings.shopName;
		kassentageList = await getAllKassentage();
		await loadAll();
	});

	async function loadAll() {
		filterActive = false;
		selectedKassentagId = 'all';
		transactions = await getAllTransactions();
	}

	async function handleKassentagChange() {
		if (selectedKassentagId === 'all') {
			filterActive = false;
			transactions = await getAllTransactions();
		} else {
			filterActive = true;
			transactions = await getTransactionsByKassentag(selectedKassentagId);
		}
	}
```

- [ ] **Step 4: Update `reloadCurrent`**

Replace:

```ts
	async function reloadCurrent() {
		if (filterActive) {
			const from = startOfDay(new Date(dateFrom));
			const to = endOfDay(new Date(dateTo));
			transactions = await getTransactionsByDateRange(from, to);
		} else {
			await loadAll();
		}
	}
```

with:

```ts
	async function reloadCurrent() {
		kassentageList = await getAllKassentage();
		if (filterActive && selectedKassentagId !== 'all') {
			transactions = await getTransactionsByKassentag(selectedKassentagId);
		} else {
			await loadAll();
		}
	}
```

- [ ] **Step 5: Update export handlers to pass the selected Kassentag**

Replace:

```ts
	function handleExport() {
		exportTransactionsToXlsx(transactions, shopName);
	}

	function handleProductExport() {
		exportProductSummaryToXlsx(transactions, shopName);
	}
```

with:

```ts
	function handleExport() {
		exportTransactionsToXlsx(transactions, shopName, selectedKassentag);
	}

	function handleProductExport() {
		exportProductSummaryToXlsx(transactions, shopName, selectedKassentag);
	}
```

And replace:

```ts
	function handleJsonExport() {
		exportTransactionsToJson(transactions, shopName);
	}
```

with:

```ts
	function handleJsonExport() {
		exportTransactionsToJson(transactions, shopName, selectedKassentag);
	}
```

(These calls compile once Task 10 adds the new optional parameter to those functions — until then
`pnpm check` will report a "too many arguments" error, expected and resolved in Task 10.)

- [ ] **Step 6: Auto-assign `kassentagId` in the transaction edit modal**

Replace `saveEditTransaction`:

```ts
	async function saveEditTransaction() {
		if (!editValid || editSaving) return;
		editSaving = true;
		try {
			const items: TransactionItem[] = editItems.map((i) => ({
				productId: i.productId,
				productName: i.productName.trim(),
				price: i.price,
				quantity: i.quantity,
				subtotal: Math.round(i.price * i.quantity * 100) / 100
			}));
			const tx: Transaction = {
				id: editTxId,
				timestamp: new Date(editTimestamp).getTime(),
				items,
				total: editTotal,
				amountPaid: editAmountPaid,
				change: editChange,
				paymentMethod: editPaymentMethod
			};
			await saveTransaction(tx);
			await reloadCurrent();
			editModalOpen = false;
		} finally {
			editSaving = false;
		}
	}
```

with:

```ts
	async function saveEditTransaction() {
		if (!editValid || editSaving) return;
		editSaving = true;
		try {
			const items: TransactionItem[] = editItems.map((i) => ({
				productId: i.productId,
				productName: i.productName.trim(),
				price: i.price,
				quantity: i.quantity,
				subtotal: Math.round(i.price * i.quantity * 100) / 100
			}));
			const timestamp = new Date(editTimestamp).getTime();
			const kassentag = await findKassentagForTimestamp(timestamp);
			const tx: Transaction = {
				id: editTxId,
				timestamp,
				items,
				total: editTotal,
				amountPaid: editAmountPaid,
				change: editChange,
				paymentMethod: editPaymentMethod,
				kassentagId: kassentag?.id ?? null
			};
			await saveTransaction(tx);
			await reloadCurrent();
			editModalOpen = false;
		} finally {
			editSaving = false;
		}
	}
```

- [ ] **Step 7: Replace the Von/Bis filter markup with a Kassentag dropdown**

Replace:

```svelte
<!-- Filter -->
<div class="bg-surface-light rounded-xl p-4 mb-6 flex items-end gap-4 flex-wrap">
	<div>
		<label for="from" class="block text-sm text-text-muted mb-1">Von</label>
		<input
			id="from"
			type="date"
			class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent"
			bind:value={dateFrom}
		/>
	</div>
	<div>
		<label for="to" class="block text-sm text-text-muted mb-1">Bis</label>
		<input
			id="to"
			type="date"
			class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent"
			bind:value={dateTo}
		/>
	</div>
	<button
		type="button"
		class="bg-accent hover:bg-accent-hover text-white rounded-lg px-6 py-2 font-semibold transition-colors"
		onclick={applyFilter}
	>
		Filtern
	</button>
	{#if filterActive}
		<button
			type="button"
			class="bg-surface-lighter hover:bg-surface-lighter/80 rounded-lg px-6 py-2 font-semibold transition-colors text-text-muted"
			onclick={loadAll}
		>
			Filter zurücksetzen
		</button>
	{/if}
</div>
```

with:

```svelte
<!-- Filter -->
<div class="bg-surface-light rounded-xl p-4 mb-6 flex items-end gap-4 flex-wrap">
	<div>
		<label for="kassentag-filter" class="block text-sm text-text-muted mb-1">Kassentag</label>
		<select
			id="kassentag-filter"
			class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent min-w-64"
			bind:value={selectedKassentagId}
			onchange={handleKassentagChange}
		>
			<option value="all">Alle Kassentage</option>
			{#each kassentageList as k}
				<option value={k.id}>{formatKassentagRange(k)}{k.status === 'open' ? ' 🟢' : ''}</option>
			{/each}
		</select>
	</div>
</div>
```

- [ ] **Step 8: Run `pnpm check`**

Run: `pnpm check`
Expected: FAILS only on the export function calls (too many arguments) — those functions gain the
new parameter in Task 10. Confirm no other errors.

- [ ] **Step 9: Manual verification (deferred)**

Full manual verification of this page happens at the end of Task 10, once the export functions
accept the new parameter and the page type-checks cleanly end-to-end.

- [ ] **Step 10: Commit**

```bash
git add src/routes/admin/statistics/+page.svelte
git commit -m "feat(statistics): replace date-range filter with Kassentag filter

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Export labeling — Kassentag period in Excel/JSON exports

**Files:**
- Modify: `src/lib/utils/export.ts`

**Interfaces:**
- Consumes: `Kassentag` type (Task 1), `formatKassentagRange` (Task 5).
- Produces: `exportTransactionsToXlsx`, `exportProductSummaryToXlsx`, and `exportTransactionsToJson`
  each gain an optional third parameter `kassentag?: Kassentag | null`. `parseTransactionsJson` now
  accepts both the legacy bare-array JSON shape and the new `{ kassentag, transactions }` shape, and
  normalizes any transaction missing `kassentagId` to `null`.

- [ ] **Step 1: Update imports and add the label helper**

At the top of `src/lib/utils/export.ts`, replace:

```ts
import * as XLSX from 'xlsx';
import type { Transaction } from '$lib/types';
import { formatDate } from '$lib/utils/currency';
```

with:

```ts
import * as XLSX from 'xlsx';
import type { Transaction, Kassentag } from '$lib/types';
import { formatDate } from '$lib/utils/currency';
import { formatKassentagRange } from '$lib/utils/kassentag';

function kassentagPeriodLabel(kassentag?: Kassentag | null): string {
	return kassentag ? `Kassentag: ${formatKassentagRange(kassentag)}` : 'Alle Kassentage';
}
```

- [ ] **Step 2: Label `exportTransactionsToXlsx`'s first sheet**

Replace the function signature and its "Sheet 1" block:

```ts
export function exportTransactionsToXlsx(transactions: Transaction[], shopName: string): void {
	const wb = XLSX.utils.book_new();

	// Sheet 1: All transactions
	const txRows = transactions.flatMap((tx) =>
		tx.items.map((item) => ({
			Datum: formatDate(tx.timestamp),
			'Transaktions-ID': tx.id.slice(0, 8),
			Zahlungsart: (tx.paymentMethod ?? 'cash') === 'card' ? 'Karte' : 'Bar',
			Produkt: item.productName,
			Einzelpreis: item.price,
			Menge: item.quantity,
			Zwischensumme: item.subtotal,
			Gesamt: tx.total,
			Bezahlt: tx.amountPaid,
			Rückgeld: tx.change
		}))
	);

	const txSheet = XLSX.utils.json_to_sheet(txRows);
	XLSX.utils.book_append_sheet(wb, txSheet, 'Transaktionen');
```

with:

```ts
export function exportTransactionsToXlsx(
	transactions: Transaction[],
	shopName: string,
	kassentag?: Kassentag | null
): void {
	const wb = XLSX.utils.book_new();

	// Sheet 1: All transactions
	const txRows = transactions.flatMap((tx) =>
		tx.items.map((item) => ({
			Datum: formatDate(tx.timestamp),
			'Transaktions-ID': tx.id.slice(0, 8),
			Zahlungsart: (tx.paymentMethod ?? 'cash') === 'card' ? 'Karte' : 'Bar',
			Produkt: item.productName,
			Einzelpreis: item.price,
			Menge: item.quantity,
			Zwischensumme: item.subtotal,
			Gesamt: tx.total,
			Bezahlt: tx.amountPaid,
			Rückgeld: tx.change
		}))
	);

	const txSheet = XLSX.utils.json_to_sheet(txRows, { origin: 'A3' });
	XLSX.utils.sheet_add_aoa(txSheet, [[kassentagPeriodLabel(kassentag)]], { origin: 'A1' });
	XLSX.utils.book_append_sheet(wb, txSheet, 'Transaktionen');
```

- [ ] **Step 3: Label `exportProductSummaryToXlsx`'s first sheet**

Replace the function signature and the "Sheet 1" append call:

```ts
export function exportProductSummaryToXlsx(transactions: Transaction[], shopName: string): void {
	const wb = XLSX.utils.book_new();
```

with:

```ts
export function exportProductSummaryToXlsx(
	transactions: Transaction[],
	shopName: string,
	kassentag?: Kassentag | null
): void {
	const wb = XLSX.utils.book_new();
```

And replace:

```ts
	XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Produkte');
```

with:

```ts
	const summarySheet = XLSX.utils.json_to_sheet(summaryRows, { origin: 'A3' });
	XLSX.utils.sheet_add_aoa(summarySheet, [[kassentagPeriodLabel(kassentag)]], { origin: 'A1' });
	XLSX.utils.book_append_sheet(wb, summarySheet, 'Produkte');
```

- [ ] **Step 4: Add Kassentag metadata to the JSON export**

Replace:

```ts
export function exportTransactionsToJson(transactions: Transaction[], shopName: string): void {
	const dateStr = new Date().toISOString().slice(0, 10);
	const json = JSON.stringify(transactions, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${shopName}_Transaktionen_${dateStr}.json`;
	a.click();
	URL.revokeObjectURL(url);
}
```

with:

```ts
export function exportTransactionsToJson(
	transactions: Transaction[],
	shopName: string,
	kassentag?: Kassentag | null
): void {
	const dateStr = new Date().toISOString().slice(0, 10);
	const payload = { kassentag: kassentag ?? null, transactions };
	const json = JSON.stringify(payload, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${shopName}_Transaktionen_${dateStr}.json`;
	a.click();
	URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Make `parseTransactionsJson` accept both the legacy array shape and the new
  metadata-object shape**

Replace:

```ts
export async function parseTransactionsJson(file: File): Promise<Transaction[]> {
	const text = await file.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('Ungültige JSON-Datei');
	}
	if (!Array.isArray(data)) {
		throw new Error('JSON muss ein Array von Transaktionen sein');
	}
	for (const item of data) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof (item as Record<string, unknown>).id !== 'string' ||
			typeof (item as Record<string, unknown>).timestamp !== 'number' ||
			!Array.isArray((item as Record<string, unknown>).items)
		) {
			throw new Error('Ungültiges Format: Jeder Eintrag benötigt id, timestamp und items');
		}
	}
	return data as Transaction[];
}
```

with:

```ts
export async function parseTransactionsJson(file: File): Promise<Transaction[]> {
	const text = await file.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('Ungültige JSON-Datei');
	}

	const list: unknown = Array.isArray(data)
		? data
		: (data as Record<string, unknown> | null)?.transactions;

	if (!Array.isArray(list)) {
		throw new Error(
			'JSON muss ein Array von Transaktionen oder ein Export-Objekt mit "transactions" enthalten'
		);
	}

	for (const item of list) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof (item as Record<string, unknown>).id !== 'string' ||
			typeof (item as Record<string, unknown>).timestamp !== 'number' ||
			!Array.isArray((item as Record<string, unknown>).items)
		) {
			throw new Error('Ungültiges Format: Jeder Eintrag benötigt id, timestamp und items');
		}
	}

	return (list as Array<Record<string, unknown>>).map((item) => ({
		...(item as Transaction),
		kassentagId: typeof item.kassentagId === 'string' ? item.kassentagId : null
	}));
}
```

- [ ] **Step 6: Run `pnpm check`**

Run: `pnpm check`
Expected: 0 errors, 0 warnings across the whole project — this is the last task touching a type
that other files depend on, so the entire `kassentagId`-missing error chain from Task 1 should now
be fully resolved everywhere.

- [ ] **Step 7: Manual verification — statistics page + exports end-to-end**

1. Run `pnpm dev`, log into `/admin/statistics`.
2. Confirm the "Von/Bis" filter is gone, replaced by a "Kassentag" dropdown containing "Alle
   Kassentage" plus one entry per Kassentag created in earlier manual tests.
3. Select a specific (closed) Kassentag from the dropdown. Confirm the transaction list, revenue
   cards, and product breakdown update to only that Kassentag's transactions.
4. With that Kassentag selected, click "📊 Excel-Download Transaktionen". Open the downloaded file
   and confirm cell A1 of the "Transaktionen" sheet reads `Kassentag: <range>` and the actual table
   starts at row 3.
5. Click "📤 JSON-Export" with the same filter active. Open the downloaded `.json` file and confirm
   its top-level shape is `{ "kassentag": {...}, "transactions": [...] }` with the correct
   Kassentag record.
6. Switch the dropdown back to "Alle Kassentage", export again, and confirm the Excel sheet's A1
   cell now reads "Alle Kassentage" and the JSON's `"kassentag"` field is `null`.
7. Import the JSON file downloaded in step 5 back in via "📥 JSON-Import" — confirm it reports the
   expected number of "aktualisiert" transactions (no errors), verifying the new object-shaped
   JSON is accepted by `parseTransactionsJson`.
8. Use "+ Neue Transaktion" to add a transaction with a timestamp inside the previously-selected
   Kassentag's time range. Save it, then filter the statistics page to that Kassentag again and
   confirm the new transaction appears (i.e. `kassentagId` was auto-assigned correctly).

- [ ] **Step 8: Commit**

```bash
git add src/lib/utils/export.ts
git commit -m "feat(export): label Excel/JSON exports with Kassentag period, accept legacy JSON

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

## Post-plan check

After Task 10 is committed, run `pnpm build:web` once as a final full-project sanity check (the
service worker / PWA build step also runs `svelte-check`-independent bundling that can surface
issues `pnpm check` alone does not, e.g. unused imports triggering Vite warnings). Confirm the build
succeeds with no new warnings compared to the pre-Kassentag baseline.

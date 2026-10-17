# Test Suite Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a balanced, reliable test pyramid for KassenBuddy that protects checkout, IndexedDB data integrity, Kassentag behavior, critical Svelte interactions, and a small set of browser smoke flows.

**Architecture:** Vitest remains the fast foundation for pure logic and `fake-indexeddb` integration tests. Svelte Testing Library adds focused DOM-level component coverage, while Playwright covers only complete, business-critical browser flows. A separate pull-request workflow runs type checks and both test layers without coupling quality checks to the GitHub Pages deployment.

**Tech Stack:** SvelteKit 2, Svelte 5, TypeScript, Vitest 5, `fake-indexeddb`, Svelte Testing Library, `@testing-library/jest-dom`, jsdom, Playwright, GitHub Actions, pnpm 11, Node.js 24

## Global Constraints

- Do not begin Task 1 until `feature/kassentag` is fully merged into `main`.
- Before changing files, compare every path and API named below with the current `main`; adjust the plan if the merge changed them.
- Use Svelte 5 runes and existing component conventions.
- Keep persistent business-data access in `src/lib/db/index.ts`.
- Preserve `stock: null` as unlimited stock.
- Keep German-facing labels and assertions consistent with the UI.
- Use `$app/paths` for internal URLs and static resources.
- Keep Vitest tests deterministic and independent of network access.
- Keep Playwright limited to the smoke flows explicitly listed in this plan.
- Measure coverage initially; do not add a global percentage threshold.
- Do not modify or replace the existing GitHub Pages deployment workflow.

---

### Task 1: Verify the Merge Baseline and Complete the Vitest Foundation

**Files:**
- Verify: `package.json`
- Verify: `pnpm-lock.yaml`
- Verify: `vite.config.ts`
- Verify: `tests/indexeddb.test.ts`
- Verify: `tests/db-upgrade.test.ts`
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `tests/setup.ts`

**Interfaces:**
- Consumes: the merged Vitest 5, `fake-indexeddb`, and IndexedDB tests from `feature/kassentag`
- Produces: `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`, and a shared Vitest setup file

- [ ] **Step 1: Confirm that the feature branch is merged**

Run:

```powershell
git branch --show-current
git merge-base --is-ancestor feature/kassentag main
git --no-pager log main --oneline -10
```

Expected:

- Current branch is `main`.
- `git merge-base --is-ancestor` exits with code `0`.
- The log contains the Kassentag implementation and commit `3d42d7c` or its squashed equivalent.

If the ancestor check fails, stop. Do not perform later tasks.

- [ ] **Step 2: Verify the merged baseline before editing**

Run:

```powershell
git --no-pager diff feature/kassentag..main -- package.json vite.config.ts tests src/lib/db/index.ts src/lib/stores/cart.svelte.ts
pnpm install --frozen-lockfile
pnpm test
pnpm check
```

Expected:

- The diff reveals any post-merge API changes that require plan adjustments.
- Dependency installation succeeds.
- The two introduced IndexedDB tests pass.
- `svelte-check` reports no errors.

- [ ] **Step 3: Add the test support dependencies**

Run:

```powershell
pnpm add -D @testing-library/jest-dom @testing-library/svelte @vitest/coverage-v8 jsdom
```

Expected: `package.json` and `pnpm-lock.yaml` contain the four development dependencies and pnpm reports a successful install.

- [ ] **Step 4: Add the shared Vitest setup**

Create `tests/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

afterEach(async () => {
	if (typeof document !== 'undefined') {
		const { cleanup } = await import('@testing-library/svelte');
		cleanup();
	}
	if (typeof localStorage !== 'undefined') localStorage.clear();
	if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
});
```

- [ ] **Step 5: Configure Vitest and coverage**

Update the `test` block in `vite.config.ts`:

```ts
test: {
	environment: 'node',
	setupFiles: ['./tests/setup.ts'],
	coverage: {
		provider: 'v8',
		reporter: ['text', 'html', 'json-summary'],
		include: ['src/lib/**/*.{ts,svelte}'],
		exclude: ['src/lib/types/**']
	}
},
```

Keep all existing SvelteKit, Tailwind, and PWA plugins unchanged.

- [ ] **Step 6: Add the local test scripts**

Set these scripts in `package.json`:

```json
{
	"test": "vitest run",
	"test:watch": "vitest",
	"test:coverage": "vitest run --coverage",
	"test:ci": "pnpm check && vitest run"
}
```

Preserve every existing build, Android, preview, check, and watch script.

- [ ] **Step 7: Run the foundation checks**

Run:

```powershell
pnpm test
pnpm test:coverage
pnpm check
```

Expected: all existing tests pass, coverage files are generated under `coverage/`, and `svelte-check` reports no errors.

- [ ] **Step 8: Ensure generated coverage is ignored**

If `coverage/` is not already ignored, append this exact entry to `.gitignore`:

```gitignore
coverage/
```

- [ ] **Step 9: Commit the foundation**

```powershell
git add package.json pnpm-lock.yaml vite.config.ts tests/setup.ts .gitignore
git commit -m "test: complete Vitest foundation" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Add Deterministic Fixtures and IndexedDB Lifecycle Control

**Files:**
- Modify: `src/lib/db/index.ts`
- Create: `tests/fixtures/domain.ts`
- Create: `tests/helpers/database.ts`
- Create: `tests/integration/db-lifecycle.test.ts`

**Interfaces:**
- Consumes: `getDb(): Promise<KasseDB>` and the merged domain types
- Produces: `closeDb(): void`, `resetTestDatabase(): Promise<void>`, `createProduct()`, `createSettings()`, `createTransaction()`, and `createKassentag()`

- [ ] **Step 1: Write the failing lifecycle test**

Create `tests/integration/db-lifecycle.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import { getDb } from '$lib/db';
import { resetTestDatabase } from '../helpers/database';

afterEach(resetTestDatabase);

it('can reopen a clean database after closing the shared connection', async () => {
	const first = await getDb();
	await first.put('settings', { ...(await first.get('settings', 'main'))!, shopName: 'Changed' }, 'main');

	await resetTestDatabase();

	const second = await getDb();
	expect((await second.get('settings', 'main'))?.shopName).not.toBe('Changed');
});
```

- [ ] **Step 2: Run the test and verify the missing helper failure**

Run:

```powershell
pnpm vitest run tests/integration/db-lifecycle.test.ts
```

Expected: FAIL because `tests/helpers/database.ts` and `closeDb()` do not exist.

- [ ] **Step 3: Add explicit DB connection cleanup**

Add to `src/lib/db/index.ts` immediately after `getDb()`:

```ts
export function closeDb(): void {
	dbInstance?.close();
	dbInstance = null;
	dbInitPromise = null;
}
```

This is a general lifecycle API, not a test-only backdoor.

- [ ] **Step 4: Add the database reset helper**

Create `tests/helpers/database.ts`:

```ts
import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { closeDb } from '$lib/db';

export const TEST_DB_NAME = 'kasse-db';

export async function resetTestDatabase(): Promise<void> {
	closeDb();
	await deleteDB(TEST_DB_NAME);
}
```

- [ ] **Step 5: Add typed domain fixtures**

Create `tests/fixtures/domain.ts` using the merged type definitions:

```ts
import type { Kassentag, Product, Settings, Transaction } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

export function createProduct(overrides: Partial<Product> = {}): Product {
	return {
		id: 'product-1',
		name: 'Testgetränk',
		price: 2.5,
		purchasePrice: 1,
		category: 'Getränke',
		imageBlob: null,
		active: true,
		sortOrder: 0,
		createdAt: 1_700_000_000_000,
		stock: 10,
		...overrides
	};
}

export function createSettings(overrides: Partial<Settings> = {}): Settings {
	return {
		...DEFAULT_SETTINGS,
		quickDiscountPercents: [...DEFAULT_SETTINGS.quickDiscountPercents],
		categories: [...DEFAULT_SETTINGS.categories],
		...overrides
	};
}

export function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		id: 'transaction-1',
		timestamp: 1_700_000_000_000,
		items: [
			{
				productId: 'product-1',
				productName: 'Testgetränk',
				price: 2.5,
				quantity: 2,
				subtotal: 5
			}
		],
		total: 5,
		amountPaid: 10,
		change: 5,
		paymentMethod: 'cash',
		kassentagId: null,
		...overrides
	};
}

export function createKassentag(overrides: Partial<Kassentag> = {}): Kassentag {
	return {
		id: 'kassentag-1',
		startedAt: 1_700_000_000_000,
		endedAt: null,
		status: 'open',
		source: 'manual',
		...overrides
	};
}
```

If the merged `Kassentag` type differs, update this fixture to match the actual required fields without weakening the type.

- [ ] **Step 6: Run the lifecycle test**

Run:

```powershell
pnpm vitest run tests/integration/db-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit lifecycle support**

```powershell
git add src/lib/db/index.ts tests/fixtures/domain.ts tests/helpers/database.ts tests/integration/db-lifecycle.test.ts
git commit -m "test: isolate IndexedDB integration tests" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Cover Cart Calculations and Checkout Orchestration

**Files:**
- Create: `tests/unit/cart.test.ts`
- Modify only if a failing test exposes a defect: `src/lib/stores/cart.svelte.ts`

**Interfaces:**
- Consumes: `cart`, `getSettings()`, and `commitCheckout()`
- Produces: regression coverage for cart totals, discounts, quantities, stock updates, quota updates, and checkout clearing

- [ ] **Step 1: Create mocked DB boundaries and reset state**

Start `tests/unit/cart.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProduct, createSettings } from '../fixtures/domain';

const { getSettings, commitCheckout } = vi.hoisted(() => ({
	getSettings: vi.fn(),
	commitCheckout: vi.fn()
}));

vi.mock('$lib/db', () => ({
	getSettings,
	commitCheckout
}));

const { cart } = await import('$lib/stores/cart.svelte');

beforeEach(() => {
	cart.clear();
	getSettings.mockReset();
	commitCheckout.mockReset();
	getSettings.mockResolvedValue(createSettings({ drinkQuotaCounter: 50 }));
	commitCheckout.mockResolvedValue(undefined);
});
```

- [ ] **Step 2: Add failing calculation tests**

Add:

```ts
describe('cart calculations', () => {
	it('rounds the subtotal and total to cents', () => {
		cart.add(createProduct({ id: 'a', price: 0.1 }));
		cart.add(createProduct({ id: 'b', price: 0.2 }));

		expect(cart.subtotal).toBe(0.3);
		expect(cart.total).toBe(0.3);
		expect(cart.count).toBe(2);
	});

	it('keeps only the latest percentage discount', () => {
		cart.add(createProduct({ price: 10 }));

		expect(cart.addPercentageDiscount(10)).toBe(true);
		expect(cart.addPercentageDiscount(20)).toBe(true);

		expect(cart.discountTotal).toBe(-2);
		expect(cart.total).toBe(8);
		expect(cart.items.filter((item) => cart.isDiscountItem(item))).toHaveLength(1);
	});

	it.each([0, -1, 101])('rejects invalid discount %s', (percent) => {
		cart.add(createProduct({ price: 10 }));
		expect(cart.addPercentageDiscount(percent)).toBe(false);
		expect(cart.hasDiscount).toBe(false);
	});

	it('does not allow a discount on an empty cart', () => {
		expect(cart.addPercentageDiscount(10)).toBe(false);
	});
});
```

- [ ] **Step 3: Run the calculation tests**

Run:

```powershell
pnpm vitest run tests/unit/cart.test.ts
```

Expected: PASS. If a case fails, make the smallest correction in `cart.svelte.ts` and rerun.

- [ ] **Step 4: Add failing checkout orchestration tests**

Append:

```ts
describe('cart checkout', () => {
	it('commits the transaction, quota update, and finite stock update together', async () => {
		cart.add(createProduct({ id: 'finite', stock: 5, price: 2 }));
		cart.increment('finite');
		cart.add(createProduct({ id: 'unlimited', stock: null, price: 1 }));

		const transaction = await cart.checkout(10, 'cash');

		expect(transaction.total).toBe(5);
		expect(transaction.change).toBe(5);
		expect(commitCheckout).toHaveBeenCalledOnce();
		expect(commitCheckout).toHaveBeenCalledWith(
			transaction,
			expect.objectContaining({ drinkQuotaCounter: 47 }),
			[{ productId: 'finite', quantity: 2 }]
		);
		expect(cart.items).toEqual([]);
	});

	it('persists a discount as a transaction item without reducing stock for it', async () => {
		cart.add(createProduct({ id: 'drink', stock: 10, price: 10 }));
		cart.addPercentageDiscount(25);

		const transaction = await cart.checkout(10, 'card');

		expect(transaction.total).toBe(7.5);
		expect(transaction.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ productId: 'drink', subtotal: 10 }),
				expect.objectContaining({ productId: 'discount:25', subtotal: -2.5 })
			])
		);
		expect(commitCheckout).toHaveBeenCalledWith(
			transaction,
			expect.objectContaining({ drinkQuotaCounter: 49 }),
			[{ productId: 'drink', quantity: 1 }]
		);
	});

	it('keeps the cart when persistence fails', async () => {
		cart.add(createProduct());
		commitCheckout.mockRejectedValueOnce(new Error('write failed'));

		await expect(cart.checkout(5)).rejects.toThrow('write failed');
		expect(cart.items).toHaveLength(1);
	});
});
```

- [ ] **Step 5: Run and correct only confirmed defects**

Run:

```powershell
pnpm vitest run tests/unit/cart.test.ts
```

Expected: all cart tests pass. The failed-persistence test must prove that `cart.clear()` runs only after `commitCheckout()` resolves.

- [ ] **Step 6: Commit cart coverage**

```powershell
git add tests/unit/cart.test.ts src/lib/stores/cart.svelte.ts
git commit -m "test: cover cart and checkout rules" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Omit `src/lib/stores/cart.svelte.ts` from `git add` if no production fix was necessary.

---

### Task 4: Cover Settings, Categories, Products, and Atomic Persistence

**Files:**
- Create: `tests/integration/db-settings.test.ts`
- Create: `tests/integration/db-products.test.ts`
- Create: `tests/integration/db-checkout.test.ts`
- Modify only for confirmed defects: `src/lib/db/index.ts`

**Interfaces:**
- Consumes: public functions from `$lib/db`, fixtures from `tests/fixtures/domain.ts`, and `resetTestDatabase()`
- Produces: integration coverage for normalization, CRUD, category cascades, finite/unlimited stock, and transaction atomicity

- [ ] **Step 1: Test settings normalization**

Create `tests/integration/db-settings.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb, getSettings, saveSettings } from '$lib/db';
import { DEFAULT_SETTINGS } from '$lib/types';
import { createSettings } from '../fixtures/domain';
import { resetTestDatabase } from '../helpers/database';

afterEach(resetTestDatabase);

describe('settings persistence', () => {
	it('creates normalized default settings for a new database', async () => {
		expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
	});

	it('normalizes malformed legacy settings when reading', async () => {
		const db = await getDb();
		await db.put(
			'settings',
			{
				...createSettings(),
				quickDiscountPercents: [0, 101, Number.NaN],
				categories: [' Getränke ', 'getränke', '', 'Snacks'],
				drinkQuotaCounter: '12.9',
				checkoutLayout: 'unknown'
			} as never,
			'main'
		);

		const settings = await getSettings();

		expect(settings.quickDiscountPercents).toEqual(DEFAULT_SETTINGS.quickDiscountPercents);
		expect(settings.categories).toEqual(['Getränke', 'Snacks', 'Sonstiges']);
		expect(settings.drinkQuotaCounter).toBe(12);
		expect(settings.checkoutLayout).toBe('compact');
	});

	it('normalizes settings before writing', async () => {
		await saveSettings(createSettings({ categories: [' Snacks ', 'snacks'] }));
		expect((await getSettings()).categories).toEqual(['Snacks', 'Sonstiges']);
	});
});
```

If `as never` is rejected after the merge, construct the malformed record as
`Record<string, unknown>` and pass it directly to the low-level object store; do not weaken
production types.

- [ ] **Step 2: Test category and product behavior**

Create `tests/integration/db-products.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
	addCategory,
	deleteCategory,
	getAllProducts,
	getCategories,
	renameCategory,
	saveProduct
} from '$lib/db';
import { createProduct } from '../fixtures/domain';
import { resetTestDatabase } from '../helpers/database';

afterEach(resetTestDatabase);

describe('products and categories', () => {
	it('sorts products by sortOrder', async () => {
		await saveProduct(createProduct({ id: 'second', sortOrder: 2 }));
		await saveProduct(createProduct({ id: 'first', sortOrder: 1 }));

		expect((await getAllProducts()).map((product) => product.id)).toEqual(['first', 'second']);
	});

	it('rejects duplicate categories case-insensitively', async () => {
		await addCategory('Spezial');
		await expect(addCategory('  spezial  ')).rejects.toThrow('Kategorie existiert bereits');
	});

	it('renames the category and all affected products', async () => {
		await saveProduct(createProduct({ category: 'Bier' }));

		await renameCategory('bier', 'Getränke');

		expect(await getCategories()).toContain('Getränke');
		expect((await getAllProducts()).find((product) => product.id === 'product-1')?.category).toBe(
			'Getränke'
		);
	});
	it('moves products to Sonstiges when deleting a category', async () => {
	it('moves products to Sonstiges when deleting a category', async () => {
		await saveProduct(createProduct({ category: 'Bier' }));

		await deleteCategory('Bier');

		expect(await getCategories()).not.toContain('Bier');
		expect((await getAllProducts()).find((product) => product.id === 'product-1')?.category).toBe(
			'Sonstiges'
		);
	});
});
```

Adjust category seed values to the merged defaults so the tests do not attempt to add an already
existing default category.

- [ ] **Step 3: Test successful atomic checkout persistence**

Create `tests/integration/db-checkout.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { commitCheckout, getDb, getSettings, saveProduct } from '$lib/db';
import { createProduct, createSettings, createTransaction } from '../fixtures/domain';
import { resetTestDatabase } from '../helpers/database';

afterEach(resetTestDatabase);

describe('commitCheckout', () => {
	it('commits transaction, settings, and finite stock in one operation', async () => {
		await saveProduct(createProduct({ id: 'finite', stock: 5 }));
		await saveProduct(createProduct({ id: 'unlimited', stock: null }));
		const transaction = createTransaction();
		const settings = createSettings({ drinkQuotaCounter: 8 });

		await commitCheckout(transaction, settings, [
			{ productId: 'finite', quantity: 2 },
			{ productId: 'unlimited', quantity: 2 }
		]);

		const db = await getDb();
		expect(await db.get('transactions', transaction.id)).toEqual(transaction);
		expect((await getSettings()).drinkQuotaCounter).toBe(8);
		expect((await db.get('products', 'finite'))?.stock).toBe(3);
		expect((await db.get('products', 'unlimited'))?.stock).toBeNull();
	});
});
```

- [ ] **Step 4: Add the rollback regression test**

Append to `tests/integration/db-checkout.test.ts`:

```ts
it('does not retain partial writes when a record cannot be cloned', async () => {
	await saveProduct(createProduct({ id: 'finite', stock: 5 }));
	const invalidTransaction = {
		...createTransaction(),
		uncloneable: () => undefined
	} as ReturnType<typeof createTransaction> & { uncloneable: () => void };

	await expect(
		commitCheckout(invalidTransaction, createSettings({ drinkQuotaCounter: 8 }), [
			{ productId: 'finite', quantity: 2 }
		])
	).rejects.toBeDefined();

	const db = await getDb();
	expect(await db.get('transactions', invalidTransaction.id)).toBeUndefined();
	expect((await getSettings()).drinkQuotaCounter).toBe(DEFAULT_SETTINGS.drinkQuotaCounter);
	expect((await db.get('products', 'finite'))?.stock).toBe(5);
});
```

Also import `DEFAULT_SETTINGS` from `$lib/types`.

- [ ] **Step 5: Run the DB integration group**

Run:

```powershell
pnpm vitest run tests/integration/db-settings.test.ts tests/integration/db-products.test.ts tests/integration/db-checkout.test.ts
```

Expected: PASS with no blocked `deleteDB()` calls and no test-order dependency.

- [ ] **Step 6: Commit DB behavior coverage**

```powershell
git add tests/integration/db-settings.test.ts tests/integration/db-products.test.ts tests/integration/db-checkout.test.ts src/lib/db/index.ts
git commit -m "test: cover persistent business rules" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Omit `src/lib/db/index.ts` if no production defect was corrected.

---

### Task 5: Complete Schema Upgrade and Kassentag Coverage

**Files:**
- Modify: `tests/db-upgrade.test.ts`
- Move to: `tests/integration/db-upgrade.test.ts`
- Create: `tests/integration/kassentag.test.ts`
- Modify only for confirmed defects: `src/lib/db/index.ts`

**Interfaces:**
- Consumes: the merged Kassentag DB API and the `by-kassentag` transaction index
- Produces: regression coverage for migration, single-active-day behavior, date boundaries, and transaction assignment

- [ ] **Step 1: Move the existing migration test without changing behavior**

Run:

```powershell
New-Item -ItemType Directory -Force tests\integration | Out-Null
git mv tests\db-upgrade.test.ts tests\integration\db-upgrade.test.ts
```

Update relative helper imports only if needed.

- [ ] **Step 2: Extend the v1-to-v2 migration test**

Add assertions to the existing test after opening the v2 database:

```ts
expect(db.objectStoreNames.contains('kassentage')).toBe(true);
expect(db.transaction('transactions').store.indexNames.contains('by-kassentag')).toBe(true);
expect(await db.get('transactions', transaction.id)).toEqual(transaction);
```

Add a second legacy transaction on a different calendar day and verify that the merged migration
logic assigns the correct legacy Kassentag records according to the final feature behavior.

- [ ] **Step 3: Add a fresh-install schema test**

Add:

```ts
it('creates every v2 store and index for a fresh database', async () => {
	const db = await getDb();
	try {
		expect([...db.objectStoreNames]).toEqual(
			expect.arrayContaining(['products', 'transactions', 'settings', 'kassentage'])
		);
		expect(db.transaction('products').store.indexNames.contains('by-category')).toBe(true);
		expect(db.transaction('transactions').store.indexNames.contains('by-timestamp')).toBe(true);
		expect(db.transaction('transactions').store.indexNames.contains('by-kassentag')).toBe(true);
	} finally {
		db.close();
	}
});
```

- [ ] **Step 4: Write Kassentag API tests against the merged signatures**

Create `tests/integration/kassentag.test.ts`. Use the actual merged exports; the expected design
names are:

```ts
getActiveKassentag(): Promise<Kassentag | null>
startKassentag(): Promise<Kassentag>
endKassentag(id: string): Promise<void>
getAllKassentage(): Promise<Kassentag[]>
updateKassentagTimes(id: string, startedAt: number, endedAt: number | null): Promise<void>
getTransactionsByKassentag(id: string): Promise<Transaction[]>
findKassentagForTimestamp(timestamp: number): Promise<Kassentag | null>
```

Cover these exact behaviors:

```ts
it('allows only one open Kassentag', async () => {
	const first = await startKassentag();
	expect((await getActiveKassentag())?.id).toBe(first.id);
	await expect(startKassentag()).rejects.toThrow();
});

it('closes the active Kassentag with an end timestamp', async () => {
	const active = await startKassentag();
	await endKassentag(active.id);
	expect(await getActiveKassentag()).toBeNull();
	expect((await getAllKassentage())[0]).toEqual(
		expect.objectContaining({ id: active.id, status: 'closed', endedAt: expect.any(Number) })
	);
});

it('matches timestamps at the inclusive Kassentag boundaries', async () => {
	const day = createKassentag({ startedAt: 1000, endedAt: 2000, status: 'closed' });
	const db = await getDb();
	await db.put('kassentage', day);

	expect((await findKassentagForTimestamp(1000))?.id).toBe(day.id);
	expect((await findKassentagForTimestamp(2000))?.id).toBe(day.id);
	expect(await findKassentagForTimestamp(2001)).toBeNull();
});
```

Also test invalid `startedAt >= endedAt`, transaction lookup through `by-kassentag`, and newest-first
ordering. If the final approved Kassentag behavior uses exclusive end boundaries, update both the
design spec and this assertion before implementation rather than silently changing the test.

- [ ] **Step 5: Run migration and Kassentag tests**

Run:

```powershell
pnpm vitest run tests/integration/db-upgrade.test.ts tests/integration/kassentag.test.ts
```

Expected: PASS and no data loss from the v1 fixture.

- [ ] **Step 6: Commit migration and Kassentag coverage**

```powershell
git add tests/integration/db-upgrade.test.ts tests/integration/kassentag.test.ts src/lib/db/index.ts
git commit -m "test: cover Kassentag persistence" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Cover Formatting, Import, Export, and Backup Validation

**Files:**
- Create: `tests/unit/currency.test.ts`
- Create: `tests/unit/transactions-json.test.ts`
- Create: `tests/integration/backup.test.ts`
- Modify only for confirmed defects: `src/lib/utils/currency.ts`
- Modify only for confirmed defects: `src/lib/utils/export.ts`
- Modify only for confirmed defects: `src/lib/utils/backup.ts`

**Interfaces:**
- Consumes: `formatCurrency()`, `startOfDay()`, `endOfDay()`, `parseTransactionsJson()`, `exportBackup()`, and `importBackup()`
- Produces: locale, date-boundary, import-validation, image round-trip, and replacement-semantics coverage

- [ ] **Step 1: Add deterministic currency and day-boundary tests**

Create `tests/unit/currency.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { endOfDay, formatCurrency, startOfDay } from '$lib/utils/currency';

describe('currency and date helpers', () => {
	it('formats euros using the German locale', () => {
		expect(formatCurrency(1234.5)).toMatch(/1\.234,50\s?€/);
	});

	it('returns local day boundaries', () => {
		const date = new Date(2026, 8, 27, 16, 30, 15, 123);
		expect(new Date(startOfDay(date))).toEqual(new Date(2026, 8, 27, 0, 0, 0, 0));
		expect(new Date(endOfDay(date))).toEqual(new Date(2026, 8, 27, 23, 59, 59, 999));
	});
});
```

- [ ] **Step 2: Add transaction JSON validation tests**

Create `tests/unit/transactions-json.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseTransactionsJson } from '$lib/utils/export';
import { createTransaction } from '../fixtures/domain';

function jsonFile(value: unknown): File {
	return new File([JSON.stringify(value)], 'transactions.json', { type: 'application/json' });
}

describe('parseTransactionsJson', () => {
	it('accepts a valid transaction array', async () => {
		const transaction = createTransaction();
		await expect(parseTransactionsJson(jsonFile([transaction]))).resolves.toEqual([transaction]);
	});

	it('rejects invalid JSON', async () => {
		const file = new File(['{'], 'transactions.json', { type: 'application/json' });
		await expect(parseTransactionsJson(file)).rejects.toThrow('Ungültige JSON-Datei');
	});

	it.each([
		{},
		[{}],
		[{ id: 'tx', timestamp: 'wrong', items: [] }],
		[{ id: 'tx', timestamp: 1, items: 'wrong' }]
	])('rejects malformed transaction data %#', async (value) => {
		await expect(parseTransactionsJson(jsonFile(value))).rejects.toThrow();
	});
});
```

Add `// @vitest-environment jsdom` as the first line because the test constructs `File`.

- [ ] **Step 3: Add backup round-trip tests**

Create `tests/integration/backup.test.ts`:

```ts
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAllProducts, getSettings, saveProduct, saveSettings } from '$lib/db';
import { exportBackup, importBackup } from '$lib/utils/backup';
import { createProduct, createSettings } from '../fixtures/domain';
import { resetTestDatabase } from '../helpers/database';

let exportedBlob: Blob | null;

function readBlob(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsText(blob);
	});
}

beforeEach(() => {
	exportedBlob = null;
	vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
		exportedBlob = blob;
		return 'blob:test';
	});
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

afterEach(async () => {
	vi.restoreAllMocks();
	await resetTestDatabase();
});

describe('backup export and import', () => {
	it('exports settings and products as version 1 JSON', async () => {
		await saveSettings(createSettings({ shopName: 'Gesichert' }));
		await saveProduct(createProduct({ id: 'saved-product', imageBlob: null }));

		await exportBackup();

		expect(exportedBlob).not.toBeNull();
		const backup = JSON.parse(await readBlob(exportedBlob!));
		expect(backup).toEqual(
			expect.objectContaining({
				version: 1,
				settings: expect.objectContaining({ shopName: 'Gesichert' }),
				products: expect.arrayContaining([
					expect.objectContaining({ id: 'saved-product', imageDataUrl: null })
				])
			})
		);
	});

	it('rejects malformed and unknown backup formats', async () => {
		await expect(importBackup(new File(['{'], 'invalid.json'))).rejects.toThrow(
			'Ungültige JSON-Datei'
		);
		await expect(
			importBackup(
				new File(
					[JSON.stringify({ version: 99, settings: createSettings(), products: [] })],
					'unknown.json'
				)
			)
		).rejects.toThrow('Unbekannte Backup-Version: 99');
	});

	it('replaces products and restores normalized settings', async () => {
		await saveProduct(createProduct({ id: 'stale-product' }));
		const backup = {
			version: 1,
			exportedAt: 1_700_000_000_000,
			settings: createSettings({
				shopName: 'Wiederhergestellt',
				categories: [' Getränke ', 'getränke']
			}),
			products: [
				{
					...createProduct({ id: 'restored-product', category: 'Getränke' }),
					imageBlob: undefined,
					imageDataUrl: null
				}
			]
		};

		await importBackup(new File([JSON.stringify(backup)], 'backup.json'));

		expect((await getAllProducts()).map((product) => product.id)).toEqual(['restored-product']);
		expect(await getSettings()).toEqual(
			expect.objectContaining({
				shopName: 'Wiederhergestellt',
				categories: ['Getränke', 'Sonstiges']
			})
		);
	});
});
```

Replace the `imageBlob: undefined` construction with an explicit object omission if TypeScript
rejects it after the merge; the serialized backup record must contain `imageDataUrl` and no
`imageBlob` field.

- [ ] **Step 4: Run utility and backup tests**

Run:

```powershell
pnpm vitest run tests/unit/currency.test.ts tests/unit/transactions-json.test.ts tests/integration/backup.test.ts
```

Expected: PASS. Any newly exposed validation bug must be fixed with a narrow change and retained as a regression test.

- [ ] **Step 5: Commit utility coverage**

```powershell
git add tests/unit/currency.test.ts tests/unit/transactions-json.test.ts tests/integration/backup.test.ts src/lib/utils/currency.ts src/lib/utils/export.ts src/lib/utils/backup.ts
git commit -m "test: cover import and backup behavior" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Omit unchanged production files from staging.

---

### Task 7: Add Focused Svelte Component Tests

**Files:**
- Create: `tests/components/NumPad.test.ts`
- Create: `tests/components/Cart.test.ts`
- Create: `tests/components/CheckoutModal.test.ts`
- Create: `tests/components/AdminLayout.test.ts`
- Create: `tests/components/fixtures/AdminLayoutHarness.svelte`
- Modify only to improve accessible selectors: corresponding `.svelte` files

**Interfaces:**
- Consumes: Svelte Testing Library, jest-dom matchers, current German labels, and mocked DB/cart boundaries
- Produces: behavior-level coverage for numeric entry, cart interactions, payment confirmation, and PIN access

- [ ] **Step 1: Test NumPad through accessible controls**

Create `tests/components/NumPad.test.ts` beginning with:

```ts
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import NumPad from '$lib/components/shared/NumPad.svelte';

it('accepts at most two decimal places and confirms the parsed amount', async () => {
	const onconfirm = vi.fn();
	render(NumPad, { value: '', onconfirm, oncancel: vi.fn() });

	await fireEvent.click(screen.getByRole('button', { name: '1' }));
	await fireEvent.click(screen.getByRole('button', { name: ',' }));
	await fireEvent.click(screen.getByRole('button', { name: '2' }));
	await fireEvent.click(screen.getByRole('button', { name: '3' }));
	await fireEvent.click(screen.getByRole('button', { name: '4' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

	expect(onconfirm).toHaveBeenCalledWith(1.23);
});

it('clears the value and calls cancel', async () => {
	const oncancel = vi.fn();
	render(NumPad, { value: '12', onconfirm: vi.fn(), oncancel });

	await fireEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));

	expect(oncancel).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Test Cart rendering and actions**

Add these attributes to the quantity buttons in `src/lib/components/pos/Cart.svelte`:

```svelte
aria-label={`${item.product.name} verringern`}
```

and:

```svelte
aria-label={`${item.product.name} erhöhen`}
```

Create `tests/components/Cart.test.ts`:

```ts
// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Cart from '$lib/components/pos/Cart.svelte';
import { cart } from '$lib/stores/cart.svelte';
import { createProduct } from '../fixtures/domain';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn().mockResolvedValue({
		adminPin: '1234',
		currency: 'EUR',
		shopName: 'KassenBuddy',
		quickDiscountPercents: [5, 10, 20],
		categories: ['Sonstiges'],
		drinkQuotaCounter: 0,
		checkoutLayout: 'compact'
	}),
	commitCheckout: vi.fn()
}));

beforeEach(() => cart.clear());
afterEach(() => cart.clear());

it('shows an empty cart and disables checkout', () => {
	render(Cart, { oncheckout: vi.fn() });
	expect(screen.getByText('Warenkorb ist leer')).toBeInTheDocument();
	expect(screen.getByRole('button', { name: 'Bezahlen' })).toBeDisabled();
});

it('changes quantity and applies a quick discount', async () => {
	cart.add(createProduct({ name: 'Testgetränk', price: 10, stock: 1 }));
	render(Cart, { oncheckout: vi.fn() });
	await waitFor(() => expect(screen.getByRole('button', { name: '10%' })).toBeEnabled());

	await fireEvent.click(screen.getByRole('button', { name: 'Testgetränk erhöhen' }));
	expect(screen.getByText(/überschreitet den Lagerbestand/)).toBeInTheDocument();

	await fireEvent.click(screen.getByRole('button', { name: '10%' }));
	expect(screen.getByText('Rabatt')).toBeInTheDocument();
	expect(screen.getByText('-2,00 €')).toBeInTheDocument();

	await fireEvent.click(screen.getByRole('button', { name: 'Testgetränk verringern' }));
	expect(cart.count).toBe(2);
});

it('opens checkout', async () => {
	const oncheckout = vi.fn();
	cart.add(createProduct());
	render(Cart, { oncheckout });

	await fireEvent.click(screen.getByRole('button', { name: 'Bezahlen' }));

	expect(oncheckout).toHaveBeenCalledOnce();
});
```

If the runtime emits a normal space instead of a non-breaking space in formatted currency, use
`expect.stringMatching(/-2,00\s?€/)` through a text matcher rather than changing production output.

- [ ] **Step 3: Test CheckoutModal payment behavior**

Create `tests/components/CheckoutModal.test.ts`:

```ts
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CheckoutModal from '$lib/components/pos/CheckoutModal.svelte';
import { cart } from '$lib/stores/cart.svelte';
import { createProduct, createTransaction } from '../fixtures/domain';

beforeEach(() => {
	cart.clear();
	cart.add(createProduct({ price: 10 }));
});

afterEach(() => {
	vi.restoreAllMocks();
	cart.clear();
});

it('does not submit a cash payment below the total', async () => {
	const checkout = vi.spyOn(cart, 'checkout');
	render(CheckoutModal, { open: true, onclose: vi.fn(), oncomplete: vi.fn() });

	await fireEvent.click(screen.getByRole('button', { name: '5' }));
	expect(screen.getByText('Fehlbetrag')).toBeInTheDocument();
	await fireEvent.click(screen.getByRole('button', { name: 'Bestätigen' }));

	expect(checkout).not.toHaveBeenCalled();
});

it('submits the exact total for card payment', async () => {
	const checkout = vi
		.spyOn(cart, 'checkout')
		.mockResolvedValue(createTransaction({ total: 10, amountPaid: 10, change: 0, paymentMethod: 'card' }));
	render(CheckoutModal, { open: true, onclose: vi.fn(), oncomplete: vi.fn() });

	await fireEvent.click(screen.getByRole('button', { name: 'Karte' }));
	await fireEvent.click(screen.getByRole('button', { name: /Kartenzahlung bestätigen/ }));

	expect(checkout).toHaveBeenCalledWith(10, 'card');
	expect(await screen.findByText(/Bezahlt · Kartenzahlung/)).toBeInTheDocument();
});
```

- [ ] **Step 4: Test the admin PIN gate**

Create `tests/components/fixtures/AdminLayoutHarness.svelte`:

```svelte
<script lang="ts">
	import AdminLayout from '../../../src/routes/admin/+layout.svelte';
</script>

<AdminLayout>
	{#snippet children()}
		<p>Geschützter Inhalt</p>
	{/snippet}
</AdminLayout>
```

Create `tests/components/AdminLayout.test.ts`:

```ts
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { beforeEach, expect, it, vi } from 'vitest';
import AdminLayoutHarness from './fixtures/AdminLayoutHarness.svelte';
import { createSettings } from '../fixtures/domain';

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));

vi.mock('$lib/db', () => ({ getSettings }));
vi.mock('$app/paths', () => ({ base: '' }));

beforeEach(() => {
	sessionStorage.clear();
	getSettings.mockReset();
	getSettings.mockResolvedValue(createSettings({ adminPin: '2468' }));
});

async function enterPin(pin: string): Promise<void> {
	for (const digit of pin) {
		await fireEvent.click(screen.getByRole('button', { name: digit }));
	}
	await fireEvent.click(screen.getByRole('button', { name: 'Entsperren' }));
}

it('uses an existing session authentication', () => {
	sessionStorage.setItem('admin-auth', 'true');
	render(AdminLayoutHarness);
	expect(screen.getByText('Geschützter Inhalt')).toBeInTheDocument();
});

it('unlocks with the configured PIN', async () => {
	render(AdminLayoutHarness);
	await enterPin('2468');
	expect(await screen.findByText('Geschützter Inhalt')).toBeInTheDocument();
	expect(sessionStorage.getItem('admin-auth')).toBe('true');
});

it('rejects an incorrect PIN', async () => {
	render(AdminLayoutHarness);
	await enterPin('1111');
	expect(await screen.findByText('Falscher PIN')).toBeInTheDocument();
	expect(screen.queryByText('Geschützter Inhalt')).not.toBeInTheDocument();
});
```

- [ ] **Step 5: Run the component group**

Run:

```powershell
pnpm vitest run tests/components
pnpm check
```

Expected: all component tests pass and any added `aria-label` attributes pass `svelte-check`.

- [ ] **Step 6: Commit component coverage**

```powershell
git add tests/components src/lib/components/shared/NumPad.svelte src/lib/components/pos/Cart.svelte src/lib/components/pos/CheckoutModal.svelte src/routes/admin/+layout.svelte
git commit -m "test: cover critical Svelte interactions" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

Omit component files that did not require selector improvements.

---

### Task 8: Add Playwright Browser Smoke Tests

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures.ts`
- Create: `tests/e2e/checkout.spec.ts`
- Create: `tests/e2e/admin-backup.spec.ts`

**Interfaces:**
- Consumes: the built SvelteKit application and browser IndexedDB
- Produces: `pnpm test:e2e` and deterministic browser-level smoke coverage

- [ ] **Step 1: Install Playwright**

Run:

```powershell
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Expected: dependency and lockfile update succeeds and Chromium is installed locally.

- [ ] **Step 2: Add the Playwright script**

Add to `package.json`:

```json
{
	"test:e2e": "playwright test"
}
```

- [ ] **Step 3: Add browser configuration**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: false,
	retries: 0,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: {
		baseURL: 'http://127.0.0.1:5173',
		serviceWorkers: 'block',
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: 'pnpm dev --host 127.0.0.1',
		url: 'http://127.0.0.1:5173',
		reuseExistingServer: !process.env.CI
	}
});
```

- [ ] **Step 4: Add deterministic IndexedDB seeding**

Create `tests/e2e/fixtures.ts`:

```ts
import { test as base, expect, type Page } from '@playwright/test';

type Fixtures = {
	seededPage: Page;
};

export const test = base.extend<Fixtures>({
	seededPage: async ({ page }, use) => {
		await page.goto('/');
		await page.evaluate(async () => {
			const request = indexedDB.open('kasse-db');
			const db = await new Promise<IDBDatabase>((resolve, reject) => {
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});

			const storeNames = ['products', 'transactions', 'settings', 'kassentage'].filter((name) =>
				db.objectStoreNames.contains(name)
			);
			const transaction = db.transaction(storeNames, 'readwrite');

			for (const name of storeNames) {
				transaction.objectStore(name).clear();
			}

			transaction.objectStore('settings').put(
				{
					adminPin: '2468',
					currency: 'EUR',
					shopName: 'E2E Kasse',
					quickDiscountPercents: [5, 10, 20],
					categories: ['Getränke', 'Sonstiges'],
					drinkQuotaCounter: 20,
					checkoutLayout: 'compact'
				},
				'main'
			);
			transaction.objectStore('products').put({
				id: 'e2e-drink',
				name: 'E2E Getränk',
				price: 10,
				purchasePrice: 4,
				category: 'Getränke',
				imageBlob: null,
				active: true,
				sortOrder: 0,
				createdAt: 1_700_000_000_000,
				stock: 5
			});

			if (storeNames.includes('kassentage')) {
				transaction.objectStore('kassentage').put({
					id: 'e2e-kassentag',
					startedAt: Date.now() - 60_000,
					endedAt: null,
					status: 'open',
					source: 'manual'
				});
			}

			await new Promise<void>((resolve, reject) => {
				transaction.oncomplete = () => resolve();
				transaction.onerror = () => reject(transaction.error);
				transaction.onabort = () => reject(transaction.error);
			});
			db.close();
		});
		await page.reload();
		await use(page);
	}
});

export { expect };
```

Keep the schema seeding aligned with `src/lib/db/index.ts`. If maintaining duplicate upgrade logic
becomes error-prone, seed through public UI actions instead; do not import browser application
modules into the Node-side Playwright process.

- [ ] **Step 5: Add checkout smoke flows**

Create `tests/e2e/checkout.spec.ts`:

```ts
import { expect, test } from './fixtures';

test('completes a discounted cash sale and persists stock and quota', async ({ seededPage: page }) => {
	await page.getByRole('button', { name: /E2E Getränk/ }).click();
	await page.getByRole('button', { name: '10%' }).click();
	await page.getByRole('button', { name: 'Bezahlen' }).click();
	await page.getByRole('button', { name: '20 €' }).click();
	await page.getByRole('button', { name: 'Bestätigen' }).click();

	await expect(page.getByText('Rückgeld')).toBeVisible();
	await expect(page.getByText(/11,00\s?€/)).toBeVisible();
	await page.getByRole('button', { name: 'Fertig' }).click();

	await page.reload();
	await expect(page.getByText('Kontingent: 19')).toBeVisible();
	await expect(page.getByText('4 Stk.')).toBeVisible();
});

test('completes a card sale', async ({ seededPage: page }) => {
	await page.getByRole('button', { name: /E2E Getränk/ }).click();
	await page.getByRole('button', { name: 'Bezahlen' }).click();
	await page.getByRole('button', { name: /Karte/ }).click();
	await page.getByRole('button', { name: /Kartenzahlung bestätigen/ }).click();

	await expect(page.getByText(/Bezahlt · Kartenzahlung/)).toBeVisible();
});

test('starts and ends a Kassentag through the POS controls', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Kassentag starten/ }).click();
	await expect(page.getByText(/läuft/)).toBeVisible();
	await page.getByRole('button', { name: /Kassentag beenden/ }).click();
	await page.getByRole('button', { name: /wirklich beenden|bestätigen/i }).click();
	await expect(page.getByRole('button', { name: /Kassentag starten/ })).toBeVisible();
});
```

If the merged confirmation uses a different German label, change only the final confirmation
selector to that visible label.

- [ ] **Step 6: Add admin and backup smoke flows**

Create `tests/e2e/admin-backup.spec.ts`:

```ts
import { expect, test } from './fixtures';

async function enterPin(page: import('@playwright/test').Page, pin: string): Promise<void> {
	for (const digit of pin) {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.getByRole('button', { name: 'Entsperren' }).click();
}

test('rejects a wrong PIN and accepts the configured PIN', async ({ seededPage: page }) => {
	await page.getByRole('link', { name: /Admin/ }).click();
	await enterPin(page, '1111');
	await expect(page.getByText('Falscher PIN')).toBeVisible();
	await enterPin(page, '2468');
	await expect(page.getByRole('heading', { name: /Admin/ })).toBeVisible();
});

test('exports and restores settings from a backup', async ({ seededPage: page }) => {
	await page.getByRole('link', { name: /Admin/ }).click();
	await enterPin(page, '2468');
	await page.getByRole('link', { name: /Einstellungen/ }).click();

	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: /Backup exportieren/ }).click();
	const download = await downloadPromise;
	const backupPath = await download.path();
	expect(backupPath).not.toBeNull();

	await page.getByLabel('Kassenname').fill('Verändert');
	await page.getByRole('button', { name: 'Speichern' }).click();
	await expect(page.getByRole('button', { name: /Gespeichert/ })).toBeVisible();

	await page.getByLabel('Backup importieren').setInputFiles(backupPath!);
	await page.getByRole('button', { name: 'Ja, importieren' }).click();
	await expect(page.getByText('Backup erfolgreich importiert')).toBeVisible();
	await expect(page.getByLabel('Kassenname')).toHaveValue('E2E Kasse');
});
```

The non-null assertion is limited to the test after the preceding runtime assertion. Do not add
test downloads to the repository.

- [ ] **Step 7: Run browser tests**

Run:

```powershell
pnpm test:e2e
```

Expected: all smoke tests pass in Chromium with zero retries.

- [ ] **Step 8: Ignore Playwright artifacts**

Add to `.gitignore` if absent:

```gitignore
playwright-report/
test-results/
```

- [ ] **Step 9: Commit browser coverage**

```powershell
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e .gitignore
git commit -m "test: add browser smoke coverage" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 9: Add Pull-Request Quality Checks

**Files:**
- Create: `.github/workflows/test.yml`
- Verify unchanged: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `pnpm test:ci` and `pnpm test:e2e`
- Produces: independent `quality / test` and `quality / e2e` pull-request checks

- [ ] **Step 1: Create the quality workflow**

Create `.github/workflows/test.yml`:

```yaml
name: Quality

on:
  pull_request:
  push:
    branches:
      - main

permissions:
  contents: read

env:
  NODE_VERSION: '24'
  PNPM_VERSION: '11'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup pnpm
        uses: pnpm/action-setup@v5
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Check and test
        run: pnpm test:ci

      - name: Coverage
        run: pnpm test:coverage

      - name: Upload coverage
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/
          if-no-files-found: error

  e2e:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Setup pnpm
        uses: pnpm/action-setup@v5
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Chromium
        run: pnpm exec playwright install --with-deps chromium

      - name: Run browser smoke tests
        run: pnpm test:e2e

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          if-no-files-found: ignore
```

- [ ] **Step 2: Verify that deploy remains independent**

Run:

```powershell
git --no-pager diff -- .github/workflows/deploy-pages.yml
```

Expected: no diff.

- [ ] **Step 3: Run the complete local quality gate**

Run:

```powershell
pnpm test:ci
pnpm test:coverage
pnpm test:e2e
pnpm build:web
```

Expected:

- `svelte-check` passes;
- all Vitest tests pass;
- coverage report is generated without a threshold failure;
- all Chromium smoke tests pass with zero retries;
- static production build succeeds.

- [ ] **Step 4: Commit CI integration**

```powershell
git add .github/workflows/test.yml
git commit -m "ci: run automated test suites" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 10: Final Review and Baseline Documentation

**Files:**
- Modify: `README.md`
- Modify if present after merge: contributor instructions containing test commands

**Interfaces:**
- Consumes: all scripts and workflows created in Tasks 1-9
- Produces: documented local commands and a verified post-merge testing baseline

- [ ] **Step 1: Document the test commands**

Add a concise `## Tests` section to `README.md`:

````markdown
## Tests

```bash
pnpm test            # Vitest einmalig
pnpm test:watch      # Vitest im Watch-Modus
pnpm test:coverage   # Coverage-Bericht
pnpm test:e2e        # Playwright-Smoke-Tests
pnpm test:ci         # Typprüfung und Vitest
```

Browser-Tests starten den lokalen Entwicklungsserver automatisch. Vor der ersten lokalen
Ausführung muss Chromium einmalig mit `pnpm exec playwright install chromium` installiert werden.
````

- [ ] **Step 2: Check that each critical rule has a test**

Run:

```powershell
pnpm vitest list
pnpm exec playwright test --list
```

Confirm that the output includes tests for:

- cart rounding and discounts;
- checkout failure preservation;
- atomic IndexedDB writes and rollback;
- v1-to-v2 migration and data retention;
- Kassentag single-active and timestamp behavior;
- settings/category normalization;
- backup import/export;
- NumPad, Cart, CheckoutModal, and admin PIN;
- checkout and backup browser smoke flows.

- [ ] **Step 3: Run final verification**

Run:

```powershell
pnpm test:ci
pnpm test:coverage
pnpm test:e2e
pnpm build:web
git status --short
```

Expected: all commands pass and only the intended README or instruction-file changes remain.

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md
git commit -m "docs: document automated tests" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

## Execution Stop Condition

Do not execute this plan while `feature/kassentag` is unmerged. When execution begins, Task 1 is
mandatory even if the branch appeared merged earlier: the implementer must verify ancestry,
inspect the resulting `main`, and update this plan before touching test or production code if the
merged APIs differ from the assumptions recorded here.

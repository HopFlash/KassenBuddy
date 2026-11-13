# Fixed-Amount Quick Discounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable fixed-euro quick discounts with independent enable switches alongside percentage quick discounts.

**Architecture:** Keep discounts as synthetic cart products so cart totals and transaction items continue to use the current checkout flow. Extend persisted settings through the existing normalization path, surface enabled discount types in the POS, and preserve legacy percentage-discount product IDs.

**Tech Stack:** Svelte 5, TypeScript, IndexedDB through `idb`, Vitest, Testing Library, pnpm, Capacitor Android.

## Global Constraints

- Fixed discount defaults are €1, €2, and €3; both discount types are enabled by default.
- Existing percentage defaults remain `[5, 10, 20]`, and existing settings without the new fields continue to load.
- Only one quick discount is active at a time; choosing another replaces it.
- Monetary calculations use cent rounding. Fixed amounts are positive values with two-decimal precision; applying an amount larger than the subtotal discounts only the subtotal.
- Preserve compatibility for older persisted settings and existing percentage discount transactions.
- Bump `package.json` from `1.1.2` to `1.2.0`, and set Android `versionName "1.2.0"` and `versionCode 2`.
- Persistent business settings continue to be read and written through `$lib/db`.

---

## File map

- `src/lib/types/index.ts` — `Settings` fields and defaults.
- `src/lib/db/index.ts` — backward-compatible normalization for amounts and enable flags.
- `src/lib/stores/cart.svelte.ts` — typed discount identification, amount arithmetic, and mutual replacement.
- `src/routes/admin/settings/+page.svelte` — settings inputs, validation, and independent switches.
- `src/lib/components/pos/Cart.svelte` — load settings and render enabled percentage/euro buttons.
- `tests/db-upgrade.test.ts` — verify old settings normalize without a database migration.
- `tests/cart-discounts.test.ts` — exercise discount calculations and replacement.
- `tests/cart-component.test.ts` — exercise POS button visibility and application.
- `tests/admin-settings-discounts.test.ts` — verify settings values and enable switches are saved.
- `README.md`, `CHANGELOG.md` — document the added feature and release.
- `package.json`, `android/app/build.gradle` — align web and Android app versions.

## Task 1: Persist and normalize quick-discount settings

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/db/index.ts`
- Test: `tests/db-upgrade.test.ts`

**Interfaces:**
- Produces `Settings.quickDiscountAmounts: [number, number, number]`, `Settings.quickDiscountPercentsEnabled: boolean`, and `Settings.quickDiscountAmountsEnabled: boolean`.
- Defaults are `quickDiscountAmounts: [1, 2, 3]`, `quickDiscountPercentsEnabled: true`, and `quickDiscountAmountsEnabled: true`.
- Existing saved settings that lack the new fields normalize to these defaults while retaining their stored `quickDiscountPercents`.

- [ ] **Step 1: Add a failing legacy-settings normalization test**

Extend the existing `upgrades a v1 database to v2` test in `tests/db-upgrade.test.ts`. Its `settings` fixture already has the pre-feature shape and is written using the version-1 database. After the raw-storage assertion, add:

```ts
const { getSettings } = await import('$lib/db');
await expect(getSettings()).resolves.toMatchObject({
	quickDiscountPercents: [5, 15, 25],
	quickDiscountAmounts: [1, 2, 3],
	quickDiscountPercentsEnabled: true,
	quickDiscountAmountsEnabled: true
});
```

Keep the existing raw assertion `expect(db.get('settings', 'main')).resolves.toEqual(settings)`; this added assertion verifies the normalized view without rewriting the legacy record.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm exec vitest run --exclude '.worktrees/**' tests/db-upgrade.test.ts`
Expected: FAIL because the normalized settings do not yet include the fixed amounts and enable flags.

- [ ] **Step 3: Add the typed settings fields and defaults**

In `src/lib/types/index.ts`, add these fields to `Settings`:

```ts
quickDiscountPercentsEnabled: boolean;
quickDiscountAmounts: [number, number, number];
quickDiscountAmountsEnabled: boolean;
```

Add the same fields to `DEFAULT_SETTINGS` with values:

```ts
quickDiscountPercentsEnabled: true,
quickDiscountAmounts: [1, 2, 3],
quickDiscountAmountsEnabled: true,
```

Keep the existing percentage values and all unrelated settings unchanged.

- [ ] **Step 4: Normalize fixed-amount settings and flags**

In `src/lib/db/index.ts`, add a helper parallel to `normalizeQuickDiscountPercents`:

```ts
function normalizeQuickDiscountAmounts(value: unknown): [number, number, number] {
	if (Array.isArray(value) && value.length >= 3) {
		const parsed = value.slice(0, 3).map(Number);
		if (
			parsed.every(
				(amount) =>
					Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) / 100 === amount
			)
		) {
			return [parsed[0], parsed[1], parsed[2]];
		}
	}
	return [...DEFAULT_SETTINGS.quickDiscountAmounts] as [number, number, number];
}
```

Add the normalized properties to the returned `Settings` object in `normalizeSettings`:

```ts
quickDiscountPercentsEnabled:
	typeof merged.quickDiscountPercentsEnabled === 'boolean'
		? merged.quickDiscountPercentsEnabled
		: DEFAULT_SETTINGS.quickDiscountPercentsEnabled,
quickDiscountAmounts: normalizeQuickDiscountAmounts(merged.quickDiscountAmounts),
quickDiscountAmountsEnabled:
	typeof merged.quickDiscountAmountsEnabled === 'boolean'
		? merged.quickDiscountAmountsEnabled
		: DEFAULT_SETTINGS.quickDiscountAmountsEnabled,
```

Do not increment `DB_VERSION`: these are fields in the existing settings record, not a change to IndexedDB stores or indexes.

- [ ] **Step 5: Cover invalid stored amount values**

Add this test to `tests/db-upgrade.test.ts`, importing `DEFAULT_SETTINGS` and `Settings` from `$lib/types`:

```ts
it('replaces invalid fixed discounts with the defaults', async () => {
	const getDb = await loadFreshGetDb();
	await getDb();
	const { getSettings, saveSettings } = await import('$lib/db');
	const invalidSettings: Settings = {
		...DEFAULT_SETTINGS,
		quickDiscountAmounts: [1, 0, 3],
		quickDiscountAmountsEnabled: false
	};
	await saveSettings(invalidSettings);
	await expect(getSettings()).resolves.toMatchObject({
		quickDiscountAmounts: [1, 2, 3],
		quickDiscountAmountsEnabled: false
	});
});
```

This verifies invalid values fall back without overriding the independent enable flag.

- [ ] **Step 6: Run the focused test and confirm it passes**

Run: `pnpm exec vitest run --exclude '.worktrees/**' tests/db-upgrade.test.ts`
Expected: PASS, including the existing IndexedDB upgrade tests and both new normalization tests.

- [ ] **Step 7: Commit the settings model**

```sh
git add src/lib/types/index.ts src/lib/db/index.ts tests/db-upgrade.test.ts
git commit -m "feat(settings): configure fixed quick discounts"
```

## Task 2: Add fixed-amount cart discount calculations

**Files:**
- Modify: `src/lib/stores/cart.svelte.ts`
- Create: `tests/cart-discounts.test.ts`

**Interfaces:**
- Produces `cart.addFixedAmountDiscount(amount: number): boolean`.
- Continues to support `cart.addPercentageDiscount(percent: number): boolean`.
- New synthetic IDs use `discount:percent:<value>` or `discount:amount:<value>`. Existing `discount:<percent>` IDs continue to mean percentage discounts.
- `cart.discountTotal` remains negative when a discount is active and is zero otherwise.

- [ ] **Step 1: Write failing cart tests**

Create `tests/cart-discounts.test.ts` with this setup and behavior tests:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cart } from '$lib/stores/cart.svelte';
import type { Product } from '$lib/types';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(),
	commitCheckout: vi.fn()
}));

const product: Product = {
	id: 'discount-test-product',
	name: 'Testgetränk',
	price: 2.5,
	purchasePrice: 1,
	category: 'Getränke',
	imageBlob: null,
	active: true,
	sortOrder: 0,
	createdAt: 1,
	stock: 10
};

beforeEach(() => {
	cart.clear();
	cart.add(product);
});

afterEach(() => cart.clear());

describe('fixed-amount discounts', () => {
	it('continues to apply a legacy percentage discount ID', () => {
		cart.add({
			...product,
			id: 'discount:10',
			name: '10% Rabatt',
			price: 0
		});

		expect(cart.discountTotal).toBe(-0.25);
	});

	it('applies a fixed amount and replaces an existing percentage discount', () => {
		cart.addPercentageDiscount(20);
		expect(cart.discountTotal).toBe(-0.5);

		expect(cart.addFixedAmountDiscount(1.25)).toBe(true);
		expect(cart.discountTotal).toBe(-1.25);
		expect(cart.total).toBe(1.25);
		expect(cart.items.filter((item) => cart.isDiscountItem(item))).toHaveLength(1);
	});

	it('caps a fixed discount at the subtotal', () => {
		expect(cart.addFixedAmountDiscount(3)).toBe(true);
		expect(cart.discountTotal).toBe(-2.5);
		expect(cart.total).toBe(0);
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.001])(
		'rejects invalid fixed amount %s',
		(amount) => {
			expect(cart.addFixedAmountDiscount(amount)).toBe(false);
			expect(cart.hasDiscount).toBe(false);
		}
	);
});
```

Use the existing test conventions: mock `$lib/db` exports used by the cart module, call `cart.clear()` before and after each test, and add the product in `beforeEach`.

- [ ] **Step 2: Run the focused cart tests and confirm they fail**

Run: `pnpm exec vitest run --exclude '.worktrees/**' tests/cart-discounts.test.ts`
Expected: FAIL because the fixed-amount API does not exist.

- [ ] **Step 3: Parse typed discount identifiers while retaining legacy IDs**

In `src/lib/stores/cart.svelte.ts`, model a parsed discount as:

```ts
type DiscountKind = 'percent' | 'amount';
interface DiscountValue {
	kind: DiscountKind;
	value: number;
}
```

Import `formatCurrency` from `$lib/utils/currency` for the synthetic fixed-discount name. Replace the percent-only ID parser with one that:

1. Returns `null` for products whose IDs do not start with `discount:`.
2. Parses `discount:percent:<number>` as a percentage and `discount:amount:<number>` as a fixed amount.
3. Parses the legacy `discount:<number>` suffix as a percentage.
4. Returns `null` for an unknown kind, non-finite number, or non-positive number.

Create new synthetic discount products with IDs `discount:${kind}:${value}` and names `${value}% Rabatt` for percentages or `${formatCurrency(value)} Rabatt` for fixed amounts. Reuse the current synthetic product fields and keep `price: 0`.

- [ ] **Step 4: Calculate the active discount in cents**

Replace `discountPercentValue` with state for the parsed `DiscountValue | null`. Keep `recomputeMeta()` responsible for subtotal, count, and active discount discovery. Use one helper for total math:

```ts
function calculateDiscountTotal(discount: DiscountValue | null, subtotal: number): number {
	if (!discount || subtotal <= 0) return 0;
	if (discount.kind === 'percent') {
		return -roundToCents((subtotal * Math.min(discount.value, 100)) / 100);
	}
	return -Math.min(roundToCents(discount.value), subtotal);
}
```

Have the `discountTotal` getter call this helper with the active discount and current subtotal. Keep `total` as `roundToCents(subtotalValue + this.discountTotal)`. Update `getItemUnitPrice()` to return the same computed negative discount amount for the discount line item.

- [ ] **Step 5: Add the fixed-amount method**

Add `addFixedAmountDiscount(amount: number)` to the cart object. Return `false` unless the value is finite, positive, and already represents a whole number of cents:

```ts
if (!Number.isFinite(amount) || amount <= 0 || roundToCents(amount) !== amount) return false;
if (this.subtotal <= 0) return false;
this.add(createDiscountProduct('amount', amount));
return true;
```

Update `addPercentageDiscount()` to create a typed percentage product. Keep its existing range and subtotal checks. `add()` already removes any existing discount product when adding another, so preserve that one-discount-at-a-time behavior.

- [ ] **Step 6: Run the cart tests and confirm they pass**

Run: `pnpm exec vitest run --exclude '.worktrees/**' tests/cart-discounts.test.ts tests/cart-component.test.ts`
Expected: PASS. Existing percentage-discount presentation and the new fixed-discount arithmetic both remain valid.

- [ ] **Step 7: Commit the cart behavior**

```sh
git add src/lib/stores/cart.svelte.ts tests/cart-discounts.test.ts
git commit -m "feat(cart): apply fixed amount discounts"
```

## Task 3: Add independent settings controls and POS buttons

**Files:**
- Modify: `src/routes/admin/settings/+page.svelte`
- Modify: `src/lib/components/pos/Cart.svelte`
- Modify: `tests/cart-component.test.ts`
- Modify: `tests/cart-settings-error.test.ts`
- Modify: `tests/checkout-modal-kassentag.test.ts`
- Modify: `tests/pos-page.test.ts`
- Modify: `tests/statistics-page-kassentag.test.ts`
- Create: `tests/admin-settings-discounts.test.ts`

**Interfaces:**
- `settings.quickDiscountPercentsEnabled` controls only percentage-button visibility.
- `settings.quickDiscountAmountsEnabled` controls only fixed-amount-button visibility.
- `settings.quickDiscountPercents` and `settings.quickDiscountAmounts` remain three-value tuples loaded from `getSettings()`.
- Disabling a type hides its quick-apply buttons but does not delete values or remove a discount already in the cart.

- [ ] **Step 1: Add a failing settings-save test**

Create `tests/admin-settings-discounts.test.ts` with this test:

```ts
// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import SettingsPage from '../src/routes/admin/settings/+page.svelte';
import { getSettings, saveSettings } from '$lib/db';
import { DEFAULT_SETTINGS } from '$lib/types';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(),
	saveSettings: vi.fn()
}));
vi.mock('$lib/utils/backup', () => ({
	exportBackup: vi.fn(),
	importBackup: vi.fn()
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it('saves percentage and euro quick-discount switches independently', async () => {
	vi.mocked(getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS } as never);
	vi.mocked(saveSettings).mockResolvedValue(undefined);
	render(SettingsPage);

	const percentages = await screen.findByRole('checkbox', {
		name: 'Prozent-Schnellrabatte aktiv'
	});
	const amounts = screen.getByRole('checkbox', { name: 'Euro-Schnellrabatte aktiv' });
	expect((percentages as HTMLInputElement).checked).toBe(true);
	expect((amounts as HTMLInputElement).checked).toBe(true);

	await fireEvent.click(amounts);
	await fireEvent.input(screen.getByRole('spinbutton', { name: 'Euro-Schnellrabatt 1' }), {
		target: { value: '4.25' }
	});
	await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

	await vi.waitFor(() =>
		expect(saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({
				quickDiscountPercentsEnabled: true,
				quickDiscountAmountsEnabled: false,
				quickDiscountAmounts: [4.25, 2, 3]
			})
		)
	);
});
```

- [ ] **Step 2: Run the settings test and confirm it fails**

Run: `pnpm exec vitest run --exclude '.worktrees/**' tests/admin-settings-discounts.test.ts`
Expected: FAIL because the settings page does not render the new switches.

- [ ] **Step 3: Add fixed-amount inputs and independent switches**

In `src/routes/admin/settings/+page.svelte`:

- Add `quickDiscountAmounts: [1, 2, 3]`, `quickDiscountPercentsEnabled: true`, and `quickDiscountAmountsEnabled: true` to the initial `settings` state.
- Add `discountAmountInputs = $state(['1', '2', '3'])`.
- On initial load and after backup import, populate `discountAmountInputs` from `settings.quickDiscountAmounts`, just as percentage inputs are populated.
- Add `parseQuickDiscountAmounts(): [number, number, number] | null`. Parse decimal commas, require exactly three finite positive values, and reject values for which `Math.round(value * 100) / 100 !== value`.
- In `handleSaveGeneral()`, validate both sets before saving, assign both parsed tuples to `settings`, and retain the two boolean settings values.
- Add checkbox labels with these exact accessible names: `Prozent-Schnellrabatte aktiv` and `Euro-Schnellrabatte aktiv`.
- Add three fixed-amount number inputs with `min="0.01"`, `step="0.01"`, and accessible names `Euro-Schnellrabatt 1`, `Euro-Schnellrabatt 2`, and `Euro-Schnellrabatt 3`.
- Keep the existing percentage inputs and validation range unchanged.

The amount parser must return the tuple only after validating all three entries:

```ts
function parseQuickDiscountAmounts(): [number, number, number] | null {
	if (discountAmountInputs.length !== 3) return null;
	const parsed = discountAmountInputs.map((value) =>
		Number.parseFloat(String(value).replace(',', '.'))
	);
	if (
		parsed.some(
			(amount) =>
				!Number.isFinite(amount) ||
				amount <= 0 ||
				Math.round(amount * 100) / 100 !== amount
		)
	) {
		return null;
	}
	return [parsed[0], parsed[1], parsed[2]];
}
```

- [ ] **Step 4: Add independent POS groups**

In `src/lib/components/pos/Cart.svelte`, load both value tuples and both flags from `getSettings()`. Initialize them from `DEFAULT_SETTINGS` so the existing settings-load error behavior still leaves usable default buttons and a visible retry alert.

Render percentage buttons only when `quickDiscountPercentsEnabled` is true and fixed-amount buttons only when `quickDiscountAmountsEnabled` is true. Use these event bindings:

```svelte
{#if quickDiscountPercentsEnabled}
	{#each quickDiscounts as percent}
		<button type="button" onclick={() => cart.addPercentageDiscount(percent)}>{percent}%</button>
	{/each}
{/if}

{#if quickDiscountAmountsEnabled}
	{#each quickDiscountAmounts as amount}
		<button type="button" onclick={() => cart.addFixedAmountDiscount(amount)}>
			{formatCurrency(amount)}
		</button>
	{/each}
{/if}
```

Keep the existing remove button available whenever `cart.hasDiscount`, including when both types are disabled.

- [ ] **Step 5: Add POS visibility and application tests**

Update settings fixtures in `tests/cart-component.test.ts`, `tests/checkout-modal-kassentag.test.ts`, `tests/pos-page.test.ts`, and `tests/statistics-page-kassentag.test.ts` with:

```ts
quickDiscountPercentsEnabled: true,
quickDiscountAmounts: [1, 2, 3],
quickDiscountAmountsEnabled: true
```

In `tests/cart-component.test.ts`, add tests that:

- Render percentage and fixed-amount quick buttons with both flags true.
- Click a euro button and assert `cart.discountTotal` equals the negative button amount.
- Return settings with percentages disabled and amounts enabled; assert percentage buttons are absent while euro buttons remain.

In `tests/cart-settings-error.test.ts`, expect fallback buttons for both default types after a settings-load failure. Change the retry mock to return `quickDiscountPercents: [15, 20, 25]`, `quickDiscountPercentsEnabled: true`, `quickDiscountAmounts: [2, 4, 6]`, and `quickDiscountAmountsEnabled: false`; assert the percentage buttons update and the euro buttons are hidden.

- [ ] **Step 6: Run settings and POS tests**

Run: `pnpm exec vitest run --exclude '.worktrees/**' tests/admin-settings-discounts.test.ts tests/cart-component.test.ts tests/cart-settings-error.test.ts tests/checkout-modal-kassentag.test.ts tests/pos-page.test.ts tests/statistics-page-kassentag.test.ts`
Expected: PASS, proving independent persistence, visibility, application, and load-error retry behavior.

- [ ] **Step 7: Commit the settings and POS UI**

```sh
git add src/routes/admin/settings/+page.svelte src/lib/components/pos/Cart.svelte tests/admin-settings-discounts.test.ts tests/cart-component.test.ts tests/cart-settings-error.test.ts
git commit -m "feat(pos): configure fixed quick discount buttons"
```

## Task 4: Document and version the feature, then run full validation

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `android/app/build.gradle`

**Interfaces:**
- Release version is `1.2.0` in the web package and Android `versionName`; Android `versionCode` is `2`.

- [ ] **Step 1: Document both discount types**

Update the POS feature list in `README.md` to describe percentage and fixed-euro quick discounts, three configurable buttons per type, and independent activation. Update the Settings list to mention both three-value groups and their switches.

Add a `2026-11-13` entry to `CHANGELOG.md` that records fixed-euro quick discounts, independent discount-type switches, and the 1.2.0 release.

- [ ] **Step 2: Bump web and Android versions**

Set `package.json` `"version"` to `"1.2.0"`. In `android/app/build.gradle`, set:

```gradle
versionCode 2
versionName "1.2.0"
```

Do not change dependencies or regenerate the lockfile; the root package version is not a dependency change.

- [ ] **Step 3: Run all focused regression tests**

Run:

```sh
pnpm exec vitest run --exclude '.worktrees/**' tests/db-upgrade.test.ts tests/cart-discounts.test.ts tests/cart-component.test.ts tests/cart-settings-error.test.ts tests/admin-settings-discounts.test.ts tests/checkout-modal-kassentag.test.ts tests/pos-page.test.ts tests/statistics-page-kassentag.test.ts
```

Expected: PASS for all selected tests.

- [ ] **Step 4: Run type and Svelte validation**

Run: `pnpm check`
Expected: `svelte-check` completes with no errors.

- [ ] **Step 5: Build the static web application**

Run: `pnpm build:web`
Expected: Vite completes and produces the static output in `build/`.

- [ ] **Step 6: Review the final diff**

Run: `git diff --check` and inspect `git status --short` plus `git diff --stat`. Confirm only feature files are changed and leave the pre-existing Android Gradle support files and untracked user files untouched.

- [ ] **Step 7: Commit release documentation and versions**

```sh
git add README.md CHANGELOG.md package.json android/app/build.gradle
git commit -m "chore(release): publish KassenBuddy 1.2.0"
```

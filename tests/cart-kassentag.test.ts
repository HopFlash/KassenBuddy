import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KasseDB } from '$lib/db';
import type { Product, Transaction } from '$lib/types';

let openedDbs: KasseDB[] = [];

const NO_ACTIVE_ERROR =
	'Kein aktiver Kassentag – Zahlung nicht möglich. Bitte zuerst Kassentag starten.';

function makeProduct(): Product {
	return {
		id: 'product-1',
		name: 'Test product',
		price: 2,
		purchasePrice: 1,
		category: 'Getränke',
		imageBlob: null,
		active: true,
		sortOrder: 0,
		createdAt: 100,
		stock: 5
	};
}

async function loadFreshModules() {
	vi.resetModules();
	const api = await import('$lib/db');
	const db = await api.getDb();
	openedDbs.push(db);
	const { cart } = await import('$lib/stores/cart.svelte');
	return { api, db, cart };
}

beforeEach(() => {
	openedDbs = [];
	vi.stubGlobal('indexedDB', new IDBFactory());
	vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});

afterEach(() => {
	for (const db of openedDbs) db.close();
	openedDbs = [];
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe('cart checkout Kassentag assignment', () => {
	it('persists the active Kassentag ID on the checkout transaction', async () => {
		const { api, db, cart } = await loadFreshModules();
		const active = await api.startKassentag();
		cart.add(makeProduct());

		const checkout = await cart.checkout(2);

		await expect(db.get('transactions', checkout.id)).resolves.toMatchObject({
			kassentagId: active.id
		});
	});

	it('rejects checkout without an active Kassentag before any mutation', async () => {
		const { db, cart } = await loadFreshModules();
		await db.put('products', makeProduct());
		const settingsBefore = await db.get('settings', 'main');
		cart.add(makeProduct());

		await expect(cart.checkout(2)).rejects.toThrow(NO_ACTIVE_ERROR);

		await expect(db.count('transactions')).resolves.toBe(0);
		await expect(db.get('products', 'product-1')).resolves.toMatchObject({ stock: 5 });
		await expect(db.get('settings', 'main')).resolves.toEqual(settingsBefore);
		expect(cart.items).toHaveLength(1);
	});

	it('rejects a stale checkout when another connection ends the Kassentag first', async () => {
		const instanceA = await loadFreshModules();
		const instanceB = await loadFreshModules();
		const { db, cart } = instanceA;
		await db.put('products', makeProduct());
		const active = await instanceA.api.startKassentag();
		const settingsBefore = await db.get('settings', 'main');
		cart.add(makeProduct());

		// The end transaction is created while checkout prepares its data (after any
		// pre-read of the active Kassentag), so it commits before the checkout transaction.
		const originalGet = IDBObjectStore.prototype.get;
		let endPromise: Promise<void> | undefined;
		const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
			this: IDBObjectStore,
			key
		) {
			if (this.name === 'settings' && !endPromise) {
				endPromise = instanceB.api.endKassentag(active.id);
			}
			return originalGet.call(this, key);
		});

		try {
			await expect(cart.checkout(2)).rejects.toThrow(NO_ACTIVE_ERROR);
		} finally {
			getSpy.mockRestore();
		}
		expect(endPromise).toBeDefined();
		await endPromise;

		await expect(db.count('transactions')).resolves.toBe(0);
		await expect(db.get('products', 'product-1')).resolves.toMatchObject({ stock: 5 });
		await expect(db.get('settings', 'main')).resolves.toEqual(settingsBefore);
		await expect(db.get('kassentage', active.id)).resolves.toMatchObject({ status: 'closed' });
		expect(cart.items).toHaveLength(1);
	});

	it('keeps the active Kassentag ID when checkout commits before another connection ends it', async () => {
		const instanceA = await loadFreshModules();
		const instanceB = await loadFreshModules();
		const { db, cart } = instanceA;
		await db.put('products', makeProduct());
		const active = await instanceA.api.startKassentag();
		cart.add(makeProduct());

		const originalPut = IDBObjectStore.prototype.put;
		let endPromise: Promise<void> | undefined;
		const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
			this: IDBObjectStore,
			value,
			key
		) {
			const request = originalPut.call(this, value, key);
			if (this.name === 'transactions' && !endPromise) {
				endPromise = instanceB.api.endKassentag(active.id);
			}
			return request;
		});

		let checkout: Transaction | undefined;
		try {
			checkout = await cart.checkout(2);
		} finally {
			putSpy.mockRestore();
		}
		expect(endPromise).toBeDefined();
		await endPromise;

		expect(checkout?.kassentagId).toBe(active.id);
		await expect(db.get('transactions', checkout!.id)).resolves.toMatchObject({
			kassentagId: active.id
		});
		await expect(db.get('products', 'product-1')).resolves.toMatchObject({ stock: 4 });
		await expect(db.get('kassentage', active.id)).resolves.toMatchObject({ status: 'closed' });
	});
});

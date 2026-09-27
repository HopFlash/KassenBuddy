import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KasseDB } from '$lib/db';
import type { Product } from '$lib/types';

let openedDbs: KasseDB[] = [];

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

	it('persists null when checkout has no active Kassentag', async () => {
		const { db, cart } = await loadFreshModules();
		cart.add(makeProduct());

		const checkout = await cart.checkout(2);

		await expect(db.get('transactions', checkout.id)).resolves.toMatchObject({
			kassentagId: null
		});
	});
});

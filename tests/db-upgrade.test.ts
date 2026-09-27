import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { KasseDB } from '$lib/db';

const DB_NAME = 'kasse-db';

let openedDb: KasseDB | null = null;

async function loadFreshGetDb() {
	vi.resetModules();
	const { getDb } = await import('$lib/db');
	return async () => {
		openedDb = await getDb();
		return openedDb;
	};
}

beforeEach(() => {
	// Each test gets an isolated in-memory IndexedDB and a fresh $lib/db module (no cached singleton).
	vi.stubGlobal('indexedDB', new IDBFactory());
	vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});

afterEach(() => {
	openedDb?.close();
	openedDb = null;
	vi.unstubAllGlobals();
	vi.resetModules();
});

function makeTransaction(id: string, kassentagId: string | null) {
	return {
		id,
		timestamp: 1_700_000_000_000,
		items: [
			{ productId: 'product-1', productName: 'Test product', price: 2, quantity: 1, subtotal: 2 }
		],
		total: 2,
		amountPaid: 2,
		change: 0,
		paymentMethod: 'cash',
		kassentagId
	};
}

it('creates all stores and indexes on a fresh install', async () => {
	const getDb = await loadFreshGetDb();
	const db = await getDb();

	expect(db.version).toBe(2);
	expect([...db.objectStoreNames].sort()).toEqual(
		['kassentage', 'products', 'settings', 'transactions'].sort()
	);

	const tx = db.transaction(['products', 'transactions', 'settings', 'kassentage']);
	expect(tx.objectStore('products').keyPath).toBe('id');
	expect(tx.objectStore('products').index('by-category').keyPath).toBe('category');
	expect(tx.objectStore('transactions').keyPath).toBe('id');
	expect([...tx.objectStore('transactions').indexNames].sort()).toEqual(
		['by-kassentag', 'by-timestamp'].sort()
	);
	expect(tx.objectStore('transactions').index('by-timestamp').keyPath).toBe('timestamp');
	expect(tx.objectStore('transactions').index('by-kassentag').keyPath).toBe('kassentagId');
	expect(tx.objectStore('kassentage').keyPath).toBe('id');
	expect(tx.objectStore('settings').keyPath).toBeNull();
	await tx.done;

	await db.put('transactions', makeTransaction('fresh-tx', 'kt-fresh') as never);
	await expect(db.getAllKeysFromIndex('transactions', 'by-kassentag', 'kt-fresh')).resolves.toEqual([
		'fresh-tx'
	]);
});

it('upgrades a v1 database to v2 preserving products, settings and transactions', async () => {
	const product = {
		id: 'product-1',
		name: 'Test product',
		price: 2,
		category: 'Sonstiges',
		imageBlob: null,
		active: true,
		sortOrder: 0,
		createdAt: 1_700_000_000_000,
		stock: 5
	};
	const settings = {
		adminPin: '9876',
		currency: 'EUR',
		shopName: 'Upgrade-Test Kasse',
		quickDiscountPercents: [5, 15, 25],
		categories: ['Getränke', 'Sonstiges'],
		drinkQuotaCounter: 42,
		checkoutLayout: 'classic'
	};
	const legacyTransaction = makeTransaction('transaction-null', null);
	const assignedTransaction = makeTransaction('transaction-assigned', 'kt-1');
	const otherTransaction = makeTransaction('transaction-other', 'kt-2');

	const versionOneDb = await openDB(DB_NAME, 1, {
		upgrade(db) {
			const products = db.createObjectStore('products', { keyPath: 'id' });
			products.createIndex('by-category', 'category');

			const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
			transactions.createIndex('by-timestamp', 'timestamp');

			db.createObjectStore('settings');
		}
	});
	await versionOneDb.put('products', product);
	await versionOneDb.put('settings', settings, 'main');
	await versionOneDb.put('transactions', legacyTransaction);
	await versionOneDb.put('transactions', assignedTransaction);
	await versionOneDb.put('transactions', otherTransaction);
	versionOneDb.close();

	const getDb = await loadFreshGetDb();
	const db = await getDb();

	expect(db.version).toBe(2);
	expect([...db.objectStoreNames].sort()).toEqual(
		['kassentage', 'products', 'settings', 'transactions'].sort()
	);
	expect(db.transaction('transactions').store.index('by-kassentag').keyPath).toBe('kassentagId');

	await expect(db.getAll('products')).resolves.toEqual([product]);
	await expect(db.get('settings', 'main')).resolves.toEqual(settings);
	await expect(db.count('transactions')).resolves.toBe(3);
	await expect(db.get('transactions', legacyTransaction.id)).resolves.toEqual(legacyTransaction);
	await expect(db.get('transactions', assignedTransaction.id)).resolves.toEqual(
		assignedTransaction
	);
	await expect(db.get('transactions', otherTransaction.id)).resolves.toEqual(otherTransaction);

	// Existing rows are indexed during upgrade; null kassentagId rows are excluded.
	await expect(db.countFromIndex('transactions', 'by-kassentag')).resolves.toBe(2);
	await expect(db.getAllFromIndex('transactions', 'by-kassentag', 'kt-1')).resolves.toEqual([
		assignedTransaction
	]);
	await expect(db.getAllKeysFromIndex('transactions', 'by-kassentag', 'kt-2')).resolves.toEqual([
		otherTransaction.id
	]);
	await expect(db.count('kassentage')).resolves.toBe(0);
});

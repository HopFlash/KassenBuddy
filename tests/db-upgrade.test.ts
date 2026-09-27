import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { expect, it } from 'vitest';
import { getDb } from '$lib/db';

const DB_NAME = 'kasse-db';

it('upgrades a v1 database to v2 without losing transaction data', async () => {
	const transaction = {
		id: 'transaction-1',
		timestamp: 1_700_000_000_000,
		items: [
			{
				productId: 'product-1',
				productName: 'Test product',
				price: 2,
				quantity: 1,
				subtotal: 2
			}
		],
		total: 2,
		amountPaid: 2,
		change: 0,
		paymentMethod: 'cash',
		kassentagId: null
	};

	const versionOneDb = await openDB(DB_NAME, 1, {
		upgrade(db) {
			const products = db.createObjectStore('products', { keyPath: 'id' });
			products.createIndex('by-category', 'category');

			const transactions = db.createObjectStore('transactions', { keyPath: 'id' });
			transactions.createIndex('by-timestamp', 'timestamp');

			db.createObjectStore('settings');
		}
	});

	await versionOneDb.put('products', {
		id: 'product-1',
		name: 'Test product',
		price: 2,
		category: 'Sonstiges',
		imageBlob: null,
		active: true,
		sortOrder: 0,
		createdAt: 1_700_000_000_000,
		stock: null
	});
	await versionOneDb.put('transactions', transaction);
	versionOneDb.close();

	try {
		const db = await getDb();
		try {
			expect(db.version).toBe(2);
			expect(db.objectStoreNames.contains('products')).toBe(true);
			expect(db.objectStoreNames.contains('transactions')).toBe(true);
			expect(db.objectStoreNames.contains('settings')).toBe(true);
			expect(db.objectStoreNames.contains('kassentage')).toBe(true);
			expect(db.transaction('transactions').store.indexNames.contains('by-kassentag')).toBe(true);
			await expect(db.countFromIndex('transactions', 'by-kassentag')).resolves.toBe(0);
			await expect(db.get('transactions', transaction.id)).resolves.toEqual(transaction);
		} finally {
			db.close();
		}
	} finally {
		await deleteDB(DB_NAME);
	}
});

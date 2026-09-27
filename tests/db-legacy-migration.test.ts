import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KasseDB } from '$lib/db';
import type { Transaction } from '$lib/types';
import { endOfDay, startOfDay } from '$lib/utils/currency';

const DB_NAME = 'kasse-db';

type PersistedTransaction = Omit<Transaction, 'kassentagId'> & {
	kassentagId?: string | null;
};

let openedDb: KasseDB | null = null;

function makeTransaction(
	id: string,
	timestamp: number,
	kassentagId?: string | null
): PersistedTransaction {
	return {
		id,
		timestamp,
		items: [
			{ productId: 'product-1', productName: 'Test product', price: 2, quantity: 1, subtotal: 2 }
		],
		total: 2,
		amountPaid: 2,
		change: 0,
		paymentMethod: 'cash',
		...(kassentagId === undefined ? {} : { kassentagId })
	};
}

async function seedVersionOneTransactions(transactions: PersistedTransaction[]): Promise<void> {
	const db = await openDB(DB_NAME, 1, {
		upgrade(database) {
			const products = database.createObjectStore('products', { keyPath: 'id' });
			products.createIndex('by-category', 'category');

			const transactionStore = database.createObjectStore('transactions', { keyPath: 'id' });
			transactionStore.createIndex('by-timestamp', 'timestamp');

			database.createObjectStore('settings');
		}
	});

	for (const transaction of transactions) {
		await db.put('transactions', transaction);
	}
	db.close();
}

async function loadFreshGetDb() {
	vi.resetModules();
	const { getDb } = await import('$lib/db');
	return async () => {
		openedDb = await getDb();
		return openedDb;
	};
}

beforeEach(() => {
	vi.stubGlobal('indexedDB', new IDBFactory());
	vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
});

afterEach(() => {
	openedDb?.close();
	openedDb = null;
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe('legacy transaction migration', () => {
	it('groups unassigned transactions into closed legacy Kassentage by local calendar day', async () => {
		const firstDay = new Date(2026, 0, 15, 10, 30);
		const secondDay = new Date(2026, 0, 16, 8, 15);
		await seedVersionOneTransactions([
			makeTransaction('first-morning', firstDay.getTime()),
			makeTransaction('first-evening', new Date(2026, 0, 15, 20, 45).getTime()),
			makeTransaction('second-morning', secondDay.getTime())
		]);

		const getDb = await loadFreshGetDb();
		const db = await getDb();
		const kassentage = (await db.getAll('kassentage')).sort((a, b) => a.startedAt - b.startedAt);

		expect(kassentage).toHaveLength(2);
		expect(kassentage).toEqual([
			expect.objectContaining({
				startedAt: startOfDay(firstDay),
				endedAt: endOfDay(firstDay),
				status: 'closed',
				source: 'legacy'
			}),
			expect.objectContaining({
				startedAt: startOfDay(secondDay),
				endedAt: endOfDay(secondDay),
				status: 'closed',
				source: 'legacy'
			})
		]);

		const firstMorning = await db.get('transactions', 'first-morning');
		const firstEvening = await db.get('transactions', 'first-evening');
		const secondMorning = await db.get('transactions', 'second-morning');
		expect(firstMorning?.kassentagId).toBe(kassentage[0].id);
		expect(firstEvening?.kassentagId).toBe(kassentage[0].id);
		expect(secondMorning?.kassentagId).toBe(kassentage[1].id);
	});

	it('is idempotent across repeated getDb calls', async () => {
		const timestamp = new Date(2026, 2, 7, 14, 0).getTime();
		await seedVersionOneTransactions([makeTransaction('legacy', timestamp)]);

		const getDb = await loadFreshGetDb();
		const db = await getDb();
		const firstKassentage = await db.getAll('kassentage');
		const firstTransaction = await db.get('transactions', 'legacy');

		expect(firstKassentage).toHaveLength(1);
		expect(firstTransaction?.kassentagId).toBe(firstKassentage[0].id);

		await getDb();

		expect(await db.getAll('kassentage')).toEqual(firstKassentage);
		expect(await db.get('transactions', 'legacy')).toEqual(firstTransaction);
	});

	it('shares one migration across concurrent getDb calls', async () => {
		const getDb = await loadFreshGetDb();
		const db = await getDb();
		const timestamp = new Date(2026, 3, 12, 11, 0).getTime();
		await db.put('transactions', makeTransaction('concurrent-import', timestamp) as Transaction);

		await Promise.all([getDb(), getDb(), getDb(), getDb()]);

		const kassentage = await db.getAll('kassentage');
		const migrated = await db.get('transactions', 'concurrent-import');
		expect(kassentage).toHaveLength(1);
		expect(migrated?.kassentagId).toBe(kassentage[0].id);
	});

	it('creates one legacy Kassentag when separate module instances migrate concurrently', async () => {
		const getDbA = await loadFreshGetDb();
		const dbA = await getDbA();
		const getDbB = await loadFreshGetDb();
		const dbB = await getDbB();
		expect(getDbA).not.toBe(getDbB);
		expect(dbA).not.toBe(dbB);

		const timestamp = new Date(2026, 3, 13, 11, 0).getTime();
		await dbA.put('transactions', makeTransaction('cross-tab', timestamp) as Transaction);

		await Promise.all([getDbA(), getDbB()]);

		const kassentage = await dbA.getAll('kassentage');
		const migrated = await dbA.get('transactions', 'cross-tab');
		expect(kassentage).toHaveLength(1);
		expect(kassentage[0]).toEqual(
			expect.objectContaining({
				startedAt: startOfDay(new Date(timestamp)),
				endedAt: endOfDay(new Date(timestamp)),
				status: 'closed',
				source: 'legacy'
			})
		);
		expect(migrated?.kassentagId).toBe(kassentage[0].id);
		dbA.close();
		dbB.close();
	});

	it('migrates transactions imported without an ID on a later getDb call', async () => {
		const getDb = await loadFreshGetDb();
		const db = await getDb();
		const timestamp = new Date(2026, 4, 20, 18, 30).getTime();

		await db.put('transactions', makeTransaction('imported-later', timestamp) as Transaction);
		expect(await db.count('kassentage')).toBe(0);

		await getDb();

		const migrated = await db.get('transactions', 'imported-later');
		const kassentage = await db.getAll('kassentage');
		expect(kassentage).toEqual([
			expect.objectContaining({
				startedAt: startOfDay(new Date(timestamp)),
				endedAt: endOfDay(new Date(timestamp)),
				status: 'closed',
				source: 'legacy'
			})
		]);
		expect(migrated?.kassentagId).toBe(kassentage[0].id);
	});

	it('leaves already assigned transactions unchanged', async () => {
		const assignedTimestamp = new Date(2026, 6, 10, 9, 0).getTime();
		const legacyTimestamp = new Date(2026, 6, 11, 9, 0).getTime();
		await seedVersionOneTransactions([
			makeTransaction('assigned', assignedTimestamp, 'existing-kassentag'),
			makeTransaction('legacy', legacyTimestamp)
		]);

		const getDb = await loadFreshGetDb();
		const db = await getDb();

		expect(await db.get('transactions', 'assigned')).toEqual(
			makeTransaction('assigned', assignedTimestamp, 'existing-kassentag')
		);
		expect(await db.get('transactions', 'legacy')).toEqual(
			expect.objectContaining({ kassentagId: expect.any(String) })
		);
		expect(await db.count('kassentage')).toBe(1);
	});
});

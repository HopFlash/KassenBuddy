import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KasseDB } from '$lib/db';
import type { Kassentag, Transaction } from '$lib/types';

let openedDbs: KasseDB[] = [];

function makeKassentag(
	id: string,
	startedAt: number,
	endedAt: number | null,
	status: Kassentag['status'] = endedAt === null ? 'open' : 'closed'
): Kassentag {
	return { id, startedAt, endedAt, status, source: 'manual' };
}

function makeTransaction(id: string, timestamp: number, kassentagId: string): Transaction {
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
		kassentagId
	};
}

async function loadFreshDbModule() {
	vi.resetModules();
	const api = await import('$lib/db');
	const db = await api.getDb();
	openedDbs.push(db);
	return { api, db };
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

describe('Kassentag database functions', () => {
	it('returns null when there is no active Kassentag', async () => {
		const { api } = await loadFreshDbModule();

		await expect(api.getActiveKassentag()).resolves.toBeNull();
	});

	it('returns the open Kassentag', async () => {
		const { api, db } = await loadFreshDbModule();
		const active = makeKassentag('active', 100, null);
		await db.put('kassentage', makeKassentag('closed', 50, 75));
		await db.put('kassentage', active);

		await expect(api.getActiveKassentag()).resolves.toEqual(active);
	});

	it('starts and persists a manual open Kassentag', async () => {
		const { api, db } = await loadFreshDbModule();

		const started = await api.startKassentag();

		expect(started).toEqual({
			id: expect.any(String),
			startedAt: expect.any(Number),
			endedAt: null,
			status: 'open',
			source: 'manual'
		});
		await expect(db.get('kassentage', started.id)).resolves.toEqual(started);
	});

	it('rejects starting a second active Kassentag', async () => {
		const { api, db } = await loadFreshDbModule();
		const active = makeKassentag('active', 100, null);
		await db.put('kassentage', active);

		await expect(api.startKassentag()).rejects.toThrow('Es läuft bereits ein Kassentag');
		await expect(db.getAll('kassentage')).resolves.toEqual([active]);
	});

	it('allows only one Kassentag when independent modules start concurrently', async () => {
		const instanceA = await loadFreshDbModule();
		const instanceB = await loadFreshDbModule();
		expect(instanceA.api).not.toBe(instanceB.api);
		expect(instanceA.db).not.toBe(instanceB.db);

		const results = await Promise.allSettled([
			instanceA.api.startKassentag(),
			instanceB.api.startKassentag()
		]);

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
		await expect(instanceA.db.getAll('kassentage')).resolves.toHaveLength(1);
		await expect(instanceA.api.getActiveKassentag()).resolves.toMatchObject({ status: 'open' });
	});

	it('ends an active Kassentag with a close timestamp', async () => {
		const { api, db } = await loadFreshDbModule();
		const active = makeKassentag('active', 100, null);
		await db.put('kassentage', active);
		const beforeEnd = Date.now();

		await api.endKassentag(active.id);

		const ended = await db.get('kassentage', active.id);
		expect(ended).toMatchObject({ ...active, endedAt: expect.any(Number), status: 'closed' });
		expect(ended?.endedAt).toBeGreaterThanOrEqual(beforeEnd);
	});

	it.each([
		['the same millisecond', 1000],
		['a future start correction', 1001]
	])('rejects ending at or before %s without changing the open record', async (_case, startedAt) => {
		const { api, db } = await loadFreshDbModule();
		const active = makeKassentag('active', startedAt, null);
		await db.put('kassentage', active);
		const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);

		try {
			await expect(api.endKassentag(active.id)).rejects.toThrow(
				'Startzeit muss vor der Endzeit liegen'
			);
			await expect(db.get('kassentage', active.id)).resolves.toEqual(active);
		} finally {
			clock.mockRestore();
		}
	});

	it('does not overwrite a concurrent start-time correction when ending', async () => {
		const instanceA = await loadFreshDbModule();
		const instanceB = await loadFreshDbModule();
		const active = makeKassentag('active', 100, null);
		await instanceA.db.put('kassentage', active);

		const originalGet = IDBObjectStore.prototype.get;
		let correctionStarted = false;
		let correction: Promise<void> | undefined;
		const getSpy = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (
			this: IDBObjectStore,
			key
		) {
			const request = originalGet.call(this, key);
			if (this.name === 'kassentage' && key === active.id && !correctionStarted) {
				correctionStarted = true;
				correction = (async () => {
					const tx = instanceB.db.transaction('kassentage', 'readwrite');
					const current = await tx.store.get(active.id);
					if (!current) throw new Error('Kassentag nicht gefunden');
					await tx.store.put({ ...current, startedAt: 150 });
					await tx.done;
				})();
			}
			return request;
		});

		try {
			await instanceA.api.endKassentag(active.id);
			expect(correctionStarted).toBe(true);
			await correction;
			await expect(instanceA.db.get('kassentage', active.id)).resolves.toMatchObject({
				startedAt: 150,
				status: 'closed',
				endedAt: expect.any(Number)
			});
		} finally {
			getSpy.mockRestore();
		}
	});

	it('rejects ending a missing Kassentag', async () => {
		const { api } = await loadFreshDbModule();

		await expect(api.endKassentag('missing')).rejects.toThrow('Kassentag nicht gefunden');
	});

	it('lists Kassentage by descending start time', async () => {
		const { api, db } = await loadFreshDbModule();
		const records = [
			makeKassentag('old', 100, 150),
			makeKassentag('newest', 300, 350),
			makeKassentag('middle', 200, 250)
		];
		await Promise.all(records.map((record) => db.put('kassentage', record)));

		await expect(api.getAllKassentage()).resolves.toEqual([records[1], records[2], records[0]]);
	});

	it('corrects a Kassentag start and end time', async () => {
		const { api, db } = await loadFreshDbModule();
		const original = makeKassentag('record', 100, 200);
		await db.put('kassentage', original);

		await api.updateKassentagTimes(original.id, 110, 220);

		await expect(db.get('kassentage', original.id)).resolves.toEqual({
			...original,
			startedAt: 110,
			endedAt: 220,
			status: 'closed'
		});
	});

	it('rejects invalid corrected time ranges without changing the record', async () => {
		const { api, db } = await loadFreshDbModule();
		const original = makeKassentag('record', 100, 200);
		await db.put('kassentage', original);

		await expect(api.updateKassentagTimes(original.id, 200, 200)).rejects.toThrow(
			'Startzeit muss vor der Endzeit liegen'
		);
		await expect(api.updateKassentagTimes(original.id, 201, 200)).rejects.toThrow(
			'Startzeit muss vor der Endzeit liegen'
		);
		await expect(db.get('kassentage', original.id)).resolves.toEqual(original);
	});

	it('rejects correcting times for a missing Kassentag', async () => {
		const { api } = await loadFreshDbModule();

		await expect(api.updateKassentagTimes('missing', 100, 200)).rejects.toThrow(
			'Kassentag nicht gefunden'
		);
	});

	it('reopens a closed Kassentag when no other Kassentag is active', async () => {
		const { api, db } = await loadFreshDbModule();
		const closed = makeKassentag('closed', 100, 200);
		await db.put('kassentage', closed);

		await api.updateKassentagTimes(closed.id, 90, null);

		await expect(db.get('kassentage', closed.id)).resolves.toEqual({
			...closed,
			startedAt: 90,
			endedAt: null,
			status: 'open'
		});
	});

	it('rejects reopening when another Kassentag is active', async () => {
		const { api, db } = await loadFreshDbModule();
		const closed = makeKassentag('closed', 100, 200);
		const active = makeKassentag('active', 300, null);
		await db.put('kassentage', closed);
		await db.put('kassentage', active);

		await expect(api.updateKassentagTimes(closed.id, 90, null)).rejects.toThrow(
			'Es läuft bereits ein anderer Kassentag'
		);
		await expect(db.get('kassentage', closed.id)).resolves.toEqual(closed);
	});

	it('allows only one Kassentag when independent modules reopen different records concurrently', async () => {
		const instanceA = await loadFreshDbModule();
		const closedRecords = [
			makeKassentag('closed-a', 100, 200),
			makeKassentag('closed-b', 300, 400)
		];
		await Promise.all(closedRecords.map((record) => instanceA.db.put('kassentage', record)));

		const instanceB = await loadFreshDbModule();
		expect(instanceA.api).not.toBe(instanceB.api);
		expect(instanceA.db).not.toBe(instanceB.db);

		const results = await Promise.allSettled([
			instanceA.api.updateKassentagTimes('closed-a', 90, null),
			instanceB.api.updateKassentagTimes('closed-b', 290, null)
		]);

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
		expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
		await expect(
			instanceA.db
				.getAll('kassentage')
				.then((records) => records.filter((item) => item.status === 'open'))
		).resolves.toHaveLength(1);
	});

	it('lists transactions for one Kassentag in descending timestamp order', async () => {
		const { api, db } = await loadFreshDbModule();
		const transactions = [
			makeTransaction('old', 100, 'selected'),
			makeTransaction('newest', 300, 'selected'),
			makeTransaction('other', 400, 'other'),
			makeTransaction('middle', 200, 'selected')
		];
		await Promise.all(transactions.map((transaction) => db.put('transactions', transaction)));

		await expect(api.getTransactionsByKassentag('selected')).resolves.toEqual([
			transactions[1],
			transactions[3],
			transactions[0]
		]);
	});

	it('finds Kassentage at inclusive start and end boundaries and includes an open interval', async () => {
		const { api, db } = await loadFreshDbModule();
		const closed = makeKassentag('closed', 100, 200);
		const open = makeKassentag('open', 300, null);
		await db.put('kassentage', closed);
		await db.put('kassentage', open);

		await expect(api.findKassentagForTimestamp(100)).resolves.toEqual(closed);
		await expect(api.findKassentagForTimestamp(200)).resolves.toEqual(closed);
		await expect(api.findKassentagForTimestamp(300)).resolves.toEqual(open);
		await expect(api.findKassentagForTimestamp(Number.MAX_SAFE_INTEGER)).resolves.toEqual(open);
		await expect(api.findKassentagForTimestamp(201)).resolves.toBeNull();
		await expect(api.findKassentagForTimestamp(299)).resolves.toBeNull();
		await expect(api.findKassentagForTimestamp(99)).resolves.toBeNull();
	});
});

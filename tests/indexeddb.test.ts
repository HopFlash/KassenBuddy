import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { expect, it } from 'vitest';

it('writes and reads a record through IndexedDB', async () => {
	const databaseName = 'kassenbuddy-test';
	const db = await openDB(databaseName, 1, {
		upgrade(database) {
			database.createObjectStore('records');
		}
	});

	try {
		await db.put('records', { value: 'persisted' }, 'record');
		await expect(db.get('records', 'record')).resolves.toEqual({ value: 'persisted' });
	} finally {
		db.close();
		await deleteDB(databaseName);
	}
});

import { beforeAll, describe, expect, it } from 'vitest';
import type { Product, Transaction } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';
import * as database from './index';

const product: Product = {
	id: 'soda',
	name: 'Soda',
	price: 1,
	purchasePrice: 0,
	category: 'Softdrinks',
	imageBlob: null,
	active: true,
	sortOrder: 0,
	createdAt: 1,
	stock: 5
};

const transaction: Transaction = {
	id: 'tx-1',
	timestamp: 1,
	items: [{ productId: 'soda', productName: 'Soda', price: 1, quantity: 2, subtotal: 2 }],
	total: 2,
	amountPaid: 2,
	change: 0,
	paymentMethod: 'cash'
};

describe('completeCheckout', () => {
	beforeAll(async () => {
		const db = await database.getDb();
		await Promise.all([
			db.clear('products'),
			db.clear('transactions'),
			db.put('settings', { ...DEFAULT_SETTINGS, drinkQuotaCounter: 10 }, 'main')
		]);
		await database.saveProduct(product);
	});

	it('commits the transaction, stock, and quota together', async () => {
		await database.completeCheckout(transaction, [{ productId: 'soda', quantity: 2 }]);

		expect(await database.getAllTransactions()).toContainEqual(transaction);
		expect(await database.getProduct('soda')).toMatchObject({ stock: 3 });
		expect(await database.getSettings()).toMatchObject({ drinkQuotaCounter: 8 });
	});

	it('rolls back stock and quota when the transaction cannot be stored', async () => {
		const invalidTransaction = { ...transaction, id: undefined } as unknown as Transaction;

		await expect(
			database.completeCheckout(invalidTransaction, [{ productId: 'soda', quantity: 1 }])
		).rejects.toThrow();

		expect(await database.getAllTransactions()).toHaveLength(1);
		expect(await database.getProduct('soda')).toMatchObject({ stock: 3 });
		expect(await database.getSettings()).toMatchObject({ drinkQuotaCounter: 8 });
	});
});

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

const transaction: Omit<Transaction, 'kassentagId'> = {
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
			db.clear('kassentage'),
			db.put('settings', { ...DEFAULT_SETTINGS, drinkQuotaCounter: 10 }, 'main')
		]);
		await db.put('kassentage', {
			id: 'active',
			startedAt: 0,
			endedAt: null,
			status: 'open',
			source: 'manual'
		});
		await database.saveProduct(product);
	});

	it('commits the transaction, stock, and quota together', async () => {
		await database.commitCheckout(
			transaction,
			{ ...DEFAULT_SETTINGS, drinkQuotaCounter: 8 },
			[{ productId: 'soda', quantity: 2 }]
		);

		expect(await database.getAllTransactions()).toContainEqual({
			...transaction,
			kassentagId: 'active'
		});
		expect(await database.getProduct('soda')).toMatchObject({ stock: 3 });
		expect(await database.getSettings()).toMatchObject({ drinkQuotaCounter: 8 });
	});

	it('rolls back stock and quota when the transaction cannot be stored', async () => {
		const invalidTransaction = {
			...transaction,
			id: undefined
		} as unknown as Omit<Transaction, 'kassentagId'>;

		await expect(
			database.commitCheckout(
				invalidTransaction,
				{ ...DEFAULT_SETTINGS, drinkQuotaCounter: 7 },
				[{ productId: 'soda', quantity: 1 }]
			)
		).rejects.toThrow();

		expect(await database.getAllTransactions()).toHaveLength(1);
		expect(await database.getProduct('soda')).toMatchObject({ stock: 3 });
		expect(await database.getSettings()).toMatchObject({ drinkQuotaCounter: 8 });
	});
});

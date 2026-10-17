import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '$lib/types';

const db = vi.hoisted(() => {
	const state = { transactions: [] as unknown[] };
	return {
		state,
		saveTransaction: vi.fn(async (transaction: unknown) => {
			state.transactions.push(transaction);
		}),
		getSettings: vi.fn(async () => ({
			adminPin: '1234',
			currency: 'EUR',
			shopName: 'KassenBuddy',
			quickDiscountPercents: [5, 10, 20] as [number, number, number],
			drinkQuotaCounter: 10,
			checkoutLayout: 'compact' as const
		})),
		saveSettings: vi.fn(async () => {}),
		getProduct: vi.fn(async () => ({
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
		})),
		saveProduct: vi.fn(async () => {
			throw new Error('stock write failed');
		}),
		completeCheckout: vi.fn(async () => {
			throw new Error('checkout write failed');
		})
	};
});

vi.mock('$lib/db', () => db);

import { cart } from './cart.svelte';

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

describe('cart checkout', () => {
	beforeEach(() => {
		cart.clear();
		db.state.transactions.length = 0;
		vi.clearAllMocks();
	});

	it('does not persist a partial sale when checkout persistence fails', async () => {
		cart.add(product);

		await expect(cart.checkout(1)).rejects.toThrow('checkout write failed');

		expect(db.completeCheckout).toHaveBeenCalledOnce();
		expect(db.state.transactions).toHaveLength(0);
		expect(cart.items).toHaveLength(1);
	});
});

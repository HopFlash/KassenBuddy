import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cart } from '$lib/stores/cart.svelte';
import type { Product } from '$lib/types';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(),
	commitCheckout: vi.fn()
}));

const product: Product = {
	id: 'discount-test-product',
	name: 'Testgetränk',
	price: 2.5,
	purchasePrice: 1,
	category: 'Getränke',
	imageBlob: null,
	active: true,
	sortOrder: 0,
	createdAt: 1,
	stock: 10
};

beforeEach(() => {
	cart.clear();
	cart.add(product);
});

afterEach(() => cart.clear());

describe('fixed-amount discounts', () => {
	it('continues to apply a legacy percentage discount ID', () => {
		cart.add({
			...product,
			id: 'discount:10',
			name: '10% Rabatt',
			price: 0
		});

		expect(cart.discountTotal).toBe(-0.25);
	});

	it('applies a fixed amount and replaces an existing percentage discount', () => {
		cart.addPercentageDiscount(20);
		expect(cart.discountTotal).toBe(-0.5);

		expect(cart.addFixedAmountDiscount(1.25)).toBe(true);
		expect(cart.discountTotal).toBe(-1.25);
		expect(cart.total).toBe(1.25);
		expect(cart.items.filter((item) => cart.isDiscountItem(item))).toHaveLength(1);
	});

	it('caps a fixed discount at the subtotal', () => {
		expect(cart.addFixedAmountDiscount(3)).toBe(true);
		expect(cart.discountTotal).toBe(-2.5);
		expect(cart.total).toBe(0);
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.001])(
		'rejects invalid fixed amount %s',
		(amount) => {
			expect(cart.addFixedAmountDiscount(amount)).toBe(false);
			expect(cart.hasDiscount).toBe(false);
		}
	);
});

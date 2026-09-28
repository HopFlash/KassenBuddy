// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from '$lib/components/pos/Cart.svelte';
import { cart } from '$lib/stores/cart.svelte';
import type { Product } from '$lib/types';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(async () => ({
		quickDiscountPercents: [5, 10, 20]
	}))
}));

const product: Product = {
	id: 'test-product',
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

afterEach(() => {
	cleanup();
	cart.clear();
	vi.clearAllMocks();
});

describe('Cart Kassentag checkout gating', () => {
	it('blocks checkout without an active Kassentag while keeping cart editing available', async () => {
		const oncheckout = vi.fn();
		render(Cart, { oncheckout, kassentagActive: false });

		const checkoutButton = screen.getByRole('button', { name: 'Bezahlen' });
		expect((checkoutButton as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByText('Bitte zuerst Kassentag starten')).not.toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: '+' }));

		expect(cart.items[0].quantity).toBe(2);
		expect(oncheckout).not.toHaveBeenCalled();
	});

	it('enables checkout and calls the callback during an active Kassentag', async () => {
		const oncheckout = vi.fn();
		render(Cart, { oncheckout, kassentagActive: true });

		const checkoutButton = screen.getByRole('button', { name: 'Bezahlen' });
		expect((checkoutButton as HTMLButtonElement).disabled).toBe(false);
		expect(screen.queryByText('Bitte zuerst Kassentag starten')).toBeNull();

		await fireEvent.click(checkoutButton);

		expect(oncheckout).toHaveBeenCalledOnce();
	});
});

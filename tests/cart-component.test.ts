// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from '$lib/components/pos/Cart.svelte';
import { cart } from '$lib/stores/cart.svelte';
import { DEFAULT_SETTINGS, type Product } from '$lib/types';
import { getSettings } from '$lib/db';
import { formatCurrency } from '$lib/utils/currency';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(async () => ({
		quickDiscountPercents: [5, 10, 20],
		quickDiscountPercentsEnabled: true,
		quickDiscountAmounts: [1, 2, 3],
		quickDiscountAmountsEnabled: true
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

	it('groups discount types separately and applies a fixed-amount discount', async () => {
		render(Cart, { oncheckout: vi.fn(), kassentagActive: true });

		const percentGroup = await screen.findByRole('group', { name: 'Prozentrabatte' });
		const amountGroup = screen.getByRole('group', { name: 'Euro-Rabatte' });

		expect(
			within(percentGroup).getAllByRole('button').map((button) => button.textContent?.trim())
		).toEqual(['5%', '10%', '20%']);
		expect(
			within(amountGroup).getAllByRole('button').map((button) => button.textContent?.trim())
		).toEqual([1, 2, 3].map(formatCurrency));

		await fireEvent.click(within(amountGroup).getByRole('button', { name: formatCurrency(1) }));
		expect(cart.discountTotal).toBe(-1);
	});

	it.each([
		{
			percentsEnabled: false,
			amountsEnabled: true,
			hiddenGroup: 'Prozentrabatte',
			visibleGroup: 'Euro-Rabatte'
		},
		{
			percentsEnabled: true,
			amountsEnabled: false,
			hiddenGroup: 'Euro-Rabatte',
			visibleGroup: 'Prozentrabatte'
		}
	])(
		'hides the disabled $hiddenGroup row independently',
		async ({ percentsEnabled, amountsEnabled, hiddenGroup, visibleGroup }) => {
			vi.mocked(getSettings).mockResolvedValueOnce({
				...DEFAULT_SETTINGS,
				quickDiscountPercents: [5, 10, 20],
				quickDiscountPercentsEnabled: percentsEnabled,
				quickDiscountAmounts: [1, 2, 3],
				quickDiscountAmountsEnabled: amountsEnabled
			});
			render(Cart, { oncheckout: vi.fn(), kassentagActive: true });

			await vi.waitFor(() => {
				expect(screen.queryByRole('group', { name: hiddenGroup })).toBeNull();
				expect(screen.getByRole('group', { name: visibleGroup })).not.toBeNull();
			});
			expect(
				within(screen.getByRole('group', { name: visibleGroup })).getAllByRole('button')
			).toHaveLength(3);
		}
	);

	it('keeps discount removal available when both discount rows are disabled', async () => {
		vi.mocked(getSettings).mockResolvedValueOnce({
			...DEFAULT_SETTINGS,
			quickDiscountPercentsEnabled: false,
			quickDiscountAmountsEnabled: false
		});
		cart.addFixedAmountDiscount(1);
		render(Cart, { oncheckout: vi.fn(), kassentagActive: true });

		await vi.waitFor(() => expect(screen.queryByRole('button', { name: '5%' })).toBeNull());
		expect(screen.queryByRole('group', { name: 'Prozentrabatte' })).toBeNull();
		expect(screen.queryByRole('group', { name: 'Euro-Rabatte' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Entf.' }));

		expect(cart.hasDiscount).toBe(false);
		expect(screen.queryByText('Schnellrabatt')).toBeNull();
	});
});

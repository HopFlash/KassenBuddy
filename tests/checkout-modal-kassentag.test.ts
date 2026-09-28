// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutModal from '$lib/components/pos/CheckoutModal.svelte';
import CheckoutModalClassic from '$lib/components/pos/CheckoutModalClassic.svelte';
import { cart } from '$lib/stores/cart.svelte';
import { commitCheckout } from '$lib/db';
import type { Product } from '$lib/types';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(async () => ({ drinkQuotaCounter: 100, quickDiscountPercents: [5, 10, 20] })),
	getActiveKassentag: vi.fn(async () => null),
	commitCheckout: vi.fn()
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

const INACTIVE_ERROR = 'Kein aktiver Kassentag – Zahlung nicht möglich. Bitte zuerst Kassentag starten.';

beforeEach(() => {
	cart.clear();
	cart.add(product);
});

afterEach(() => {
	cleanup();
	cart.clear();
	vi.clearAllMocks();
});

describe.each([
	['CheckoutModal', CheckoutModal],
	['CheckoutModalClassic', CheckoutModalClassic]
])('%s Kassentag guard', (_name, Component) => {
	function baseProps(kassentagActive: boolean) {
		return { open: true, onclose: vi.fn(), oncomplete: vi.fn(), kassentagActive };
	}

	it('disables pay actions once the Kassentag ends while open', async () => {
		const view = render(Component, baseProps(true));
		const exact = screen.getAllByRole('button', { name: /^Passend/ });
		for (const button of exact) expect((button as HTMLButtonElement).disabled).toBe(false);

		await view.rerender(baseProps(false));

		for (const button of screen.getAllByRole('button', { name: /^Passend/ })) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
		expect(screen.getByText(INACTIVE_ERROR)).not.toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: '💳 Karte' }));
		const cardPay = screen.getByRole('button', { name: /Kartenzahlung bestätigen/ });
		expect((cardPay as HTMLButtonElement).disabled).toBe(true);
	});

	it('guards the numpad confirm path without checking out', async () => {
		const checkoutSpy = vi.spyOn(cart, 'checkout');
		render(Component, baseProps(false));

		await fireEvent.click(screen.getByRole('button', { name: '5' }));
		const confirmButtons = screen.getAllByRole('button', { name: 'Bestätigen' });
		await fireEvent.click(confirmButtons[confirmButtons.length - 1]);

		expect(checkoutSpy).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').textContent).toContain(INACTIVE_ERROR);
		expect(cart.items).toHaveLength(1);
		checkoutSpy.mockRestore();
	});

	it('shows the atomic rejection and keeps the cart when a stale modal checks out', async () => {
		vi.mocked(commitCheckout).mockRejectedValueOnce(new Error(INACTIVE_ERROR));
		render(Component, baseProps(true));

		await fireEvent.click(screen.getByRole('button', { name: '💳 Karte' }));
		const cardPay = screen.getByRole('button', { name: /Kartenzahlung bestätigen/ });
		await fireEvent.click(cardPay);

		await vi.waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain(
				`Zahlung fehlgeschlagen: ${INACTIVE_ERROR}`
			)
		);
		expect(commitCheckout).toHaveBeenCalledTimes(1);
		expect(cart.items).toHaveLength(1);
		expect(screen.queryByRole('button', { name: 'Fertig' })).toBeNull();
		expect((cardPay as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows a visible error and allows retry when checkout fails', async () => {
		const checkoutSpy = vi
			.spyOn(cart, 'checkout')
			.mockRejectedValueOnce(new Error('DB kaputt'));
		render(Component, baseProps(true));

		await fireEvent.click(screen.getByRole('button', { name: '💳 Karte' }));
		const cardPay = screen.getByRole('button', { name: /Kartenzahlung bestätigen/ });
		await fireEvent.click(cardPay);
		await vi.waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('Zahlung fehlgeschlagen: DB kaputt')
		);
		expect((cardPay as HTMLButtonElement).disabled).toBe(false);
		checkoutSpy.mockRestore();
	});
});

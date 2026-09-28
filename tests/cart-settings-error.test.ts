// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Cart from '$lib/components/pos/Cart.svelte';
import { cart } from '$lib/stores/cart.svelte';
import { getSettings } from '$lib/db';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn()
}));

beforeEach(() => cart.clear());

afterEach(() => {
	cleanup();
	cart.clear();
	vi.clearAllMocks();
});

describe('Cart settings load', () => {
	it('shows a visible error and keeps default quick discounts when settings fail', async () => {
		vi.mocked(getSettings).mockRejectedValueOnce(new Error('kaputt'));
		render(Cart, { oncheckout: vi.fn(), kassentagActive: true });

		await vi.waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain(
				'Schnellrabatte konnten nicht geladen werden – Standardwerte aktiv.'
			)
		);
		for (const label of ['5%', '10%', '20%']) {
			expect(screen.getByRole('button', { name: label })).not.toBeNull();
		}
	});

	it('retries loading quick discounts', async () => {
		vi.mocked(getSettings)
			.mockRejectedValueOnce(new Error('kaputt'))
			.mockResolvedValueOnce({ quickDiscountPercents: [15] } as never);
		render(Cart, { oncheckout: vi.fn(), kassentagActive: true });

		const retry = await screen.findByRole('button', { name: 'Erneut versuchen' });
		await fireEvent.click(retry);

		await vi.waitFor(() => expect(screen.getByRole('button', { name: '15%' })).not.toBeNull());
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

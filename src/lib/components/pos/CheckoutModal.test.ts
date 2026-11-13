// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CheckoutModal from './CheckoutModal.svelte';
import CheckoutModalClassic from './CheckoutModalClassic.svelte';

const checkout = vi.hoisted(() => vi.fn());

vi.mock('$lib/stores/cart.svelte', () => ({
	cart: {
		total: 5,
		checkout
	}
}));

describe('CheckoutModal', () => {
	beforeEach(() => {
		checkout.mockReset().mockRejectedValue(new Error('storage unavailable'));
	});

	it('shows a recoverable error when compact checkout persistence fails', async () => {
		render(CheckoutModal, {
			props: { open: true, onclose: vi.fn(), oncomplete: vi.fn(), kassentagActive: true }
		});

		await fireEvent.click(screen.getByRole('button', { name: /passend bezahlt/i }));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('Zahlung fehlgeschlagen: storage unavailable')
		);
		expect(screen.getByRole('button', { name: /passend bezahlt/i }).hasAttribute('disabled')).toBe(false);
	});

	it('shows a recoverable error when classic checkout persistence fails', async () => {
		render(CheckoutModalClassic, {
			props: { open: true, onclose: vi.fn(), oncomplete: vi.fn(), kassentagActive: true }
		});

		await fireEvent.click(screen.getByRole('button', { name: /passend bezahlt/i }));

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent).toContain('Zahlung fehlgeschlagen: storage unavailable')
		);
		expect(screen.getByRole('button', { name: /passend bezahlt/i }).hasAttribute('disabled')).toBe(false);
	});
});

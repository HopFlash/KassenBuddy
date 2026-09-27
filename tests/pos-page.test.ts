// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../src/routes/+page.svelte';
import { cart } from '$lib/stores/cart.svelte';
import {
	endKassentag,
	getActiveKassentag,
	getActiveProducts,
	getSettings,
	startKassentag
} from '$lib/db';
import type { Kassentag, Product } from '$lib/types';

vi.mock('$app/paths', () => ({ base: '' }));

vi.mock('$lib/db', () => ({
	getActiveProducts: vi.fn(),
	getSettings: vi.fn(),
	getActiveKassentag: vi.fn(),
	startKassentag: vi.fn(),
	endKassentag: vi.fn(),
	commitCheckout: vi.fn(async () => undefined)
}));

const product: Product = {
	id: 'p1',
	name: 'Testgetränk',
	price: 2.5,
	purchasePrice: 1,
	category: 'Getränke',
	imageBlob: null,
	active: true,
	sortOrder: 0,
	createdAt: 1,
	stock: null
};

const settings = {
	drinkQuotaCounter: 100,
	checkoutLayout: 'compact',
	quickDiscountPercents: [5, 10, 20]
};

const openDay: Kassentag = {
	id: 'k1',
	startedAt: new Date('2026-09-27T10:00:00').getTime(),
	endedAt: null,
	status: 'open',
	source: 'manual'
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	cart.clear();
	vi.mocked(getActiveProducts).mockResolvedValue([product]);
	vi.mocked(getSettings).mockResolvedValue(settings as never);
	vi.mocked(getActiveKassentag).mockResolvedValue(null);
});

afterEach(() => {
	cleanup();
	cart.clear();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('POS page load errors', () => {
	it('shows a German load error with a working retry', async () => {
		vi.mocked(getActiveProducts).mockRejectedValueOnce(new Error('IndexedDB weg'));
		render(Page);

		const alert = await screen.findByText(/Kassendaten konnten nicht geladen werden/);
		expect(alert.textContent).toContain('IndexedDB weg');

		await fireEvent.click(screen.getByRole('button', { name: 'Erneut laden' }));

		await vi.waitFor(() =>
			expect(screen.queryByText(/Kassendaten konnten nicht geladen werden/)).toBeNull()
		);
		expect(await screen.findByText('Testgetränk')).not.toBeNull();
		expect(getActiveProducts).toHaveBeenCalledTimes(2);
	});

	it('shows a refresh error after checkout and allows retry', async () => {
		vi.mocked(getActiveKassentag).mockResolvedValue(openDay);
		render(Page);

		await fireEvent.click(await screen.findByText('Testgetränk'));
		await fireEvent.click(screen.getByRole('button', { name: 'Bezahlen' }));
		await fireEvent.click(screen.getByRole('button', { name: '💳 Karte' }));

		vi.mocked(getActiveProducts).mockRejectedValueOnce(new Error('Refresh kaputt'));
		await fireEvent.click(screen.getByRole('button', { name: /Kartenzahlung bestätigen/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Fertig' }));

		const alert = await screen.findByText(/Kassendaten konnten nicht geladen werden/);
		expect(alert.textContent).toContain('Refresh kaputt');

		await fireEvent.click(screen.getByRole('button', { name: 'Erneut laden' }));
		await vi.waitFor(() =>
			expect(screen.queryByText(/Kassendaten konnten nicht geladen werden/)).toBeNull()
		);
	});
});

describe('POS Kassentag actions', () => {
	it('ignores duplicate start clicks while pending', async () => {
		const pending = deferred<Kassentag>();
		vi.mocked(startKassentag).mockReturnValue(pending.promise);
		render(Page);

		const start = await screen.findByRole('button', { name: /Kassentag starten/ });
		await fireEvent.click(start);
		await fireEvent.click(start);

		expect(startKassentag).toHaveBeenCalledTimes(1);
		expect((start as HTMLButtonElement).disabled).toBe(true);

		pending.resolve(openDay);
		expect(await screen.findByRole('button', { name: 'Kassentag beenden' })).not.toBeNull();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('ignores duplicate end confirmations while pending', async () => {
		vi.mocked(getActiveKassentag).mockResolvedValue(openDay);
		const pending = deferred<void>();
		vi.mocked(endKassentag).mockReturnValue(pending.promise);
		render(Page);

		const end = await screen.findByRole('button', { name: 'Kassentag beenden' });
		await fireEvent.click(end);
		const confirm = screen.getByRole('button', { name: 'Wirklich beenden?' });
		await fireEvent.click(confirm);
		await fireEvent.click(confirm);

		expect(endKassentag).toHaveBeenCalledTimes(1);
		expect((confirm as HTMLButtonElement).disabled).toBe(true);

		pending.resolve();
		expect(await screen.findByRole('button', { name: /Kassentag starten/ })).not.toBeNull();
	});

	it('closes an open checkout modal when the Kassentag ends', async () => {
		vi.mocked(getActiveKassentag).mockResolvedValue(openDay);
		vi.mocked(endKassentag).mockResolvedValue(undefined);
		render(Page);

		await fireEvent.click(await screen.findByText('Testgetränk'));
		await fireEvent.click(screen.getByRole('button', { name: 'Bezahlen' }));
		expect(screen.getByText('Zu zahlen')).not.toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Kassentag beenden' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Wirklich beenden?' }));

		await vi.waitFor(() => expect(screen.queryByText('Zu zahlen')).toBeNull());
		expect(cart.items).toHaveLength(1);
	});

	it('does not revert the end button after a successful stop via stale timer', async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		vi.mocked(getActiveKassentag).mockResolvedValue(openDay);
		vi.mocked(endKassentag).mockResolvedValue(undefined);
		vi.mocked(startKassentag).mockResolvedValue({ ...openDay, id: 'k2' });
		render(Page);

		await fireEvent.click(await screen.findByRole('button', { name: 'Kassentag beenden' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Wirklich beenden?' }));
		await fireEvent.click(await screen.findByRole('button', { name: /Kassentag starten/ }));
		await fireEvent.click(await screen.findByRole('button', { name: 'Kassentag beenden' }));
		expect(screen.getByRole('button', { name: 'Wirklich beenden?' })).not.toBeNull();

		// The first confirmation timer (started earlier) must not cancel the new confirmation early.
		await vi.advanceTimersByTimeAsync(1500);
		expect(screen.getByRole('button', { name: 'Wirklich beenden?' })).not.toBeNull();
		expect(vi.getTimerCount()).toBe(1);
	});
});

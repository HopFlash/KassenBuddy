// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../src/routes/admin/statistics/+page.svelte';
import {
	getAllTransactions,
	getAllKassentage,
	getTransactionsByKassentag,
	findKassentagForTimestamp,
	deleteAllTransactions,
	saveTransaction,
	deleteTransaction,
	getSettings
} from '$lib/db';
import {
	exportTransactionsToXlsx,
	exportProductSummaryToXlsx,
	exportTransactionsToJson,
	parseTransactionsJson
} from '$lib/utils/export';
import type { Kassentag, Transaction } from '$lib/types';
import { formatCurrency } from '$lib/utils/currency';

function statValue(label: string): string | null {
	const card = screen.getByText(label, { selector: 'p' }).parentElement!;
	return card.querySelectorAll('p')[1]?.textContent ?? null;
}

vi.mock('$lib/db', () => ({
	getAllTransactions: vi.fn(),
	getAllKassentage: vi.fn(),
	getTransactionsByKassentag: vi.fn(),
	findKassentagForTimestamp: vi.fn(),
	deleteAllTransactions: vi.fn(),
	saveTransaction: vi.fn(),
	deleteTransaction: vi.fn(),
	getSettings: vi.fn()
}));

vi.mock('$lib/utils/export', () => ({
	exportTransactionsToXlsx: vi.fn(),
	exportProductSummaryToXlsx: vi.fn(),
	exportTransactionsToJson: vi.fn(),
	parseTransactionsJson: vi.fn()
}));

async function selectKassentag(select: HTMLSelectElement, id: string) {
	// Wait until the Kassentag options have loaded before selecting one, otherwise
	// setting the (not-yet-existing) option value is a no-op in jsdom.
	await vi.waitFor(() => {
		const hasOption = within(select)
			.getAllByRole('option')
			.some((o) => (o as HTMLOptionElement).value === id);
		expect(hasOption).toBe(true);
	});
	await fireEvent.change(select, { target: { value: id } });
}

const kassentagA: Kassentag = {
	id: 'day-a',
	startedAt: new Date('2026-09-25T09:00:00').getTime(),
	endedAt: new Date('2026-09-25T17:00:00').getTime(),
	status: 'closed',
	source: 'manual'
};

const kassentagB: Kassentag = {
	id: 'day-b',
	startedAt: new Date('2026-09-27T10:00:00').getTime(),
	endedAt: null,
	status: 'open',
	source: 'manual'
};

const txA: Transaction = {
	id: 'tx-a',
	timestamp: new Date('2026-09-25T10:00:00').getTime(),
	items: [{ productId: 'p1', productName: 'Bier', price: 3, quantity: 2, subtotal: 6 }],
	total: 6,
	amountPaid: 6,
	change: 0,
	paymentMethod: 'cash',
	kassentagId: 'day-a'
};

const txB: Transaction = {
	id: 'tx-b',
	timestamp: new Date('2026-09-27T11:00:00').getTime(),
	items: [{ productId: 'p2', productName: 'Wein', price: 4, quantity: 1, subtotal: 4 }],
	total: 4,
	amountPaid: 5,
	change: 1,
	paymentMethod: 'card',
	kassentagId: 'day-b'
};

const allTransactions = [txA, txB];

beforeEach(() => {
	vi.mocked(getSettings).mockResolvedValue({
		adminPin: '1234',
		currency: 'EUR',
		shopName: 'TestShop',
		quickDiscountPercents: [5, 10, 20],
		categories: [],
		drinkQuotaCounter: 0,
		checkoutLayout: 'compact'
	});
	vi.mocked(getAllTransactions).mockResolvedValue(allTransactions);
	vi.mocked(getAllKassentage).mockResolvedValue([kassentagB, kassentagA]);
	vi.mocked(getTransactionsByKassentag).mockImplementation(async (id: string) =>
		allTransactions.filter((tx) => tx.kassentagId === id)
	);
	vi.mocked(findKassentagForTimestamp).mockResolvedValue(null);
	vi.mocked(saveTransaction).mockResolvedValue(undefined);
	vi.mocked(deleteTransaction).mockResolvedValue(undefined);
	vi.mocked(deleteAllTransactions).mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('Statistics page Kassentag filter', () => {
	it('loads all transactions by default with "Alle Kassentage" selected', async () => {
		render(Page);
		const select = (await screen.findByLabelText('Kassentag')) as HTMLSelectElement;
		expect(select.value).toBe('all');
		expect(await screen.findByText('2')).not.toBeNull();
	});

	it('filters transactions and revenue when a Kassentag is selected', async () => {
		render(Page);
		const select = (await screen.findByLabelText('Kassentag')) as HTMLSelectElement;

		await selectKassentag(select, 'day-a');

		await vi.waitFor(() => expect(getTransactionsByKassentag).toHaveBeenCalledWith('day-a'));
		await vi.waitFor(() => expect(screen.queryByText('1× Wein')).toBeNull());

		expect(screen.getByText('2× Bier')).not.toBeNull();
		expect(screen.getAllByRole('button', { name: 'Transaktion bearbeiten' })).toHaveLength(1);
		expect(statValue('Transaktionen')).toBe('1');
		expect(statValue('Gesamtumsatz')).toBe(formatCurrency(6));
		expect(statValue('💵 Barzahlung')).toBe(formatCurrency(6));
		expect(statValue('💳 Kartenzahlung')).toBe(formatCurrency(0));

		const breakdown = screen.getByRole('heading', { name: 'Produkt-Auswertung' }).parentElement!;
		expect(within(breakdown).getByText('Bier')).not.toBeNull();
		expect(within(breakdown).getByText('2×')).not.toBeNull();
		expect(within(breakdown).queryByText('Wein')).toBeNull();
	});

	it('returns to all transactions when "Alle Kassentage" is re-selected', async () => {
		render(Page);
		const select = (await screen.findByLabelText('Kassentag')) as HTMLSelectElement;

		await selectKassentag(select, 'day-a');
		await vi.waitFor(() => expect(getTransactionsByKassentag).toHaveBeenCalledWith('day-a'));

		vi.mocked(getAllTransactions).mockClear();
		await fireEvent.change(select, { target: { value: 'all' } });

		await vi.waitFor(() => expect(getAllTransactions).toHaveBeenCalled());
	});

	it('passes the selected Kassentag to the export functions', async () => {
		render(Page);
		const select = (await screen.findByLabelText('Kassentag')) as HTMLSelectElement;
		await selectKassentag(select, 'day-a');
		await vi.waitFor(() => expect(getTransactionsByKassentag).toHaveBeenCalledWith('day-a'));

		await fireEvent.click(screen.getByRole('button', { name: /Excel-Download.*Transaktionen/s }));
		expect(exportTransactionsToXlsx).toHaveBeenCalledWith(
			expect.any(Array),
			'TestShop',
			kassentagA
		);

		await fireEvent.click(screen.getByRole('button', { name: /Excel-Download.*Produktübersicht/s }));
		expect(exportProductSummaryToXlsx).toHaveBeenCalledWith(
			expect.any(Array),
			'TestShop',
			kassentagA
		);

		await fireEvent.click(screen.getByRole('button', { name: /JSON-Export/s }));
		expect(exportTransactionsToJson).toHaveBeenCalledWith(
			expect.any(Array),
			'TestShop',
			kassentagA
		);
	});

	it('passes null Kassentag to export functions when "Alle Kassentage" is selected', async () => {
		render(Page);
		await screen.findByLabelText('Kassentag');

		await vi.waitFor(() => expect(getAllTransactions).toHaveBeenCalled());
		await fireEvent.click(screen.getByRole('button', { name: /Excel-Download.*Transaktionen/s }));
		expect(exportTransactionsToXlsx).toHaveBeenCalledWith(expect.any(Array), 'TestShop', null);
	});

	it('assigns kassentagId on a new manual transaction whose timestamp falls inside a Kassentag interval', async () => {
		vi.mocked(findKassentagForTimestamp).mockResolvedValue(kassentagA);
		render(Page);

		await fireEvent.click(await screen.findByRole('button', { name: '+ Neue Transaktion' }));
		const nameInput = screen.getByPlaceholderText('Produktname');
		await fireEvent.input(nameInput, { target: { value: 'Cola' } });
		const priceInput = screen.getByPlaceholderText('0,00');
		await fireEvent.input(priceInput, { target: { value: '2' } });
		const paidInput = screen.getByLabelText('Bezahlt');
		await fireEvent.input(paidInput, { target: { value: '2' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		await vi.waitFor(() => expect(saveTransaction).toHaveBeenCalled());
		const saved = vi.mocked(saveTransaction).mock.calls[0][0] as Transaction;
		expect(saved.kassentagId).toBe('day-a');
	});

	it('leaves kassentagId null when the manual transaction timestamp falls outside every Kassentag interval', async () => {
		vi.mocked(findKassentagForTimestamp).mockResolvedValue(null);
		render(Page);

		await fireEvent.click(await screen.findByRole('button', { name: '+ Neue Transaktion' }));
		const nameInput = screen.getByPlaceholderText('Produktname');
		await fireEvent.input(nameInput, { target: { value: 'Cola' } });
		const priceInput = screen.getByPlaceholderText('0,00');
		await fireEvent.input(priceInput, { target: { value: '2' } });
		const paidInput = screen.getByLabelText('Bezahlt');
		await fireEvent.input(paidInput, { target: { value: '2' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		await vi.waitFor(() => expect(saveTransaction).toHaveBeenCalled());
		const saved = vi.mocked(saveTransaction).mock.calls[0][0] as Transaction;
		expect(saved.kassentagId).toBeNull();
	});

	it("re-assigns kassentagId when editing an existing transaction's timestamp into a different interval", async () => {
		vi.mocked(findKassentagForTimestamp).mockResolvedValue(kassentagB);
		render(Page);

		const editButtons = await screen.findAllByRole('button', { name: 'Transaktion bearbeiten' });
		await fireEvent.click(editButtons[0]);

		const tsInput = screen.getByLabelText('Datum & Uhrzeit') as HTMLInputElement;
		await fireEvent.input(tsInput, { target: { value: '2026-09-27T12:00' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		await vi.waitFor(() => expect(saveTransaction).toHaveBeenCalled());
		const saved = vi.mocked(saveTransaction).mock.calls[0][0] as Transaction;
		expect(saved.kassentagId).toBe('day-b');
	});

	it('preserves the selected Kassentag filter after saving/reloading', async () => {
		vi.mocked(findKassentagForTimestamp).mockResolvedValue(kassentagB);
		render(Page);
		const select = (await screen.findByLabelText('Kassentag')) as HTMLSelectElement;
		await selectKassentag(select, 'day-b');
		await vi.waitFor(() => expect(getTransactionsByKassentag).toHaveBeenCalledWith('day-b'));

		vi.mocked(getTransactionsByKassentag).mockClear();
		const editButtons = await screen.findAllByRole('button', { name: 'Transaktion bearbeiten' });
		await fireEvent.click(editButtons[0]);
		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		await vi.waitFor(() => expect(getTransactionsByKassentag).toHaveBeenCalledWith('day-b'));
		expect(select.value).toBe('day-b');
	});

	it('shows the 🟢 open marker and Kassentag range label in the dropdown options', async () => {
		render(Page);
		const select = (await screen.findByLabelText('Kassentag')) as HTMLSelectElement;
		await vi.waitFor(() => {
			expect(within(select).getAllByRole('option').length).toBeGreaterThan(1);
		});
		const options = within(select).getAllByRole('option');
		expect(options.map((o) => o.textContent)).toEqual(
			expect.arrayContaining([expect.stringContaining('🟢'), expect.stringContaining('Alle Kassentage')])
		);
	});
});

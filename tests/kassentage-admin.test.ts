// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../src/routes/admin/kassentage/+page.svelte';
import { getAllKassentage, getAllTransactions, updateKassentagTimes } from '$lib/db';
import type { Kassentag, Transaction } from '$lib/types';

vi.mock('$lib/db', () => ({
	getAllKassentage: vi.fn(),
	getAllTransactions: vi.fn(),
	updateKassentagTimes: vi.fn()
}));

const closedDay: Kassentag = {
	id: 'closed',
	startedAt: new Date('2026-09-25T09:00:00').getTime(),
	endedAt: new Date('2026-09-25T17:00:00').getTime(),
	status: 'closed',
	source: 'manual'
};

const legacyDay: Kassentag = {
	id: 'legacy',
	startedAt: new Date('2026-09-26T09:00:00').getTime(),
	endedAt: new Date('2026-09-26T17:00:00').getTime(),
	status: 'closed',
	source: 'legacy'
};

const openDay: Kassentag = {
	id: 'open',
	startedAt: new Date('2026-09-27T10:00:00').getTime(),
	endedAt: null,
	status: 'open',
	source: 'manual'
};

const transactions: Transaction[] = [
	{
		id: 'tx-1',
		timestamp: closedDay.startedAt,
		items: [],
		total: 3.5,
		amountPaid: 3.5,
		change: 0,
		paymentMethod: 'cash',
		kassentagId: 'closed'
	},
	{
		id: 'tx-2',
		timestamp: legacyDay.startedAt,
		items: [],
		total: 2,
		amountPaid: 2,
		change: 0,
		paymentMethod: 'card',
		kassentagId: 'legacy'
	}
];

beforeEach(() => {
	vi.mocked(getAllKassentage).mockResolvedValue([openDay, legacyDay, closedDay]);
	vi.mocked(getAllTransactions).mockResolvedValue(transactions);
	vi.mocked(updateKassentagTimes).mockResolvedValue(undefined);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe('Kassentage admin page', () => {
	it('lists newest first with duration, transaction totals, revenue, legacy and open states', async () => {
		render(Page);

		const editButtons = await screen.findAllByRole('button', { name: 'Bearbeiten' });
		expect(editButtons).toHaveLength(3);
		expect(editButtons[0].parentElement?.textContent).toContain('läuft noch');
		expect(editButtons[0].parentElement?.textContent).toMatch(/0\s*Transaktionen/);
		expect(editButtons[0].parentElement?.textContent).toContain('Dauer:');

		const legacyRow = screen.getByText('(migriert)').parentElement?.parentElement;
		expect(legacyRow?.textContent).toMatch(/1\s*Transaktion/);
		expect(legacyRow?.textContent).toContain('2,00 €');
		expect(legacyRow?.textContent).toContain('26.09.2026');
		expect(editButtons[1].parentElement?.textContent).toContain('(migriert)');

		const closedRow = editButtons[2].parentElement;
		expect(closedRow?.textContent).toMatch(/1\s*Transaktion/);
		expect(closedRow?.textContent).toContain('3,50 €');
	});

	it('saves corrected times for a closed Kassentag', async () => {
		render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[2]);
		const start = screen.getByLabelText('Start') as HTMLInputElement;
		const end = screen.getByLabelText('Ende') as HTMLInputElement;
		await fireEvent.input(start, { target: { value: '2026-09-25T08:00' } });
		await fireEvent.input(end, { target: { value: '2026-09-25T18:00' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(updateKassentagTimes).toHaveBeenCalledWith(
			'closed',
			new Date('2026-09-25T08:00').getTime(),
			new Date('2026-09-25T18:00').getTime()
		);
	});

	it('keeps an edited open Kassentag open', async () => {
		render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[0]);
		const checkbox = screen.getByRole('checkbox', { name: 'Läuft noch (kein Ende)' });
		expect((checkbox as HTMLInputElement).checked).toBe(true);
		await fireEvent.input(screen.getByLabelText('Start'), {
			target: { value: '2026-09-27T09:00' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(updateKassentagTimes).toHaveBeenCalledWith(
			'open',
			new Date('2026-09-27T09:00').getTime(),
			null
		);
	});

	it('shows the active-session error when reopening another day', async () => {
		vi.mocked(updateKassentagTimes).mockRejectedValueOnce(
			new Error('Es läuft bereits ein anderer Kassentag')
		);
		render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[1]);
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Läuft noch (kein Ende)' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(await screen.findByRole('alert')).not.toBeNull();
		expect(screen.getByRole('alert').textContent).toContain(
			'Es läuft bereits ein anderer Kassentag'
		);
		expect(screen.getByRole('heading', { name: 'Kassentag bearbeiten' })).not.toBeNull();
	});

	it('does not send an invalid datetime to the database', async () => {
		render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[2]);
		const start = screen.getByLabelText('Start') as HTMLInputElement;
		await fireEvent.input(start, { target: { value: '' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(await screen.findByRole('alert')).not.toBeNull();
		expect(updateKassentagTimes).not.toHaveBeenCalled();
	});

	it('shows load failure and lets the operator retry', async () => {
		vi.mocked(getAllKassentage).mockRejectedValueOnce(new Error('IndexedDB weg'));
		render(Page);

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('IndexedDB weg');
		await fireEvent.click(screen.getByRole('button', { name: 'Erneut laden' }));

		await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
		expect(getAllKassentage).toHaveBeenCalledTimes(2);
	});

	it('shows a visible save failure without closing the edit dialog', async () => {
		vi.mocked(updateKassentagTimes).mockRejectedValueOnce(new Error('DB kaputt'));
		render(Page);

		await fireEvent.click((await screen.findAllByRole('button', { name: 'Bearbeiten' }))[2]);
		await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

		expect(await screen.findByRole('alert')).not.toBeNull();
		expect(screen.getByRole('alert').textContent).toContain('DB kaputt');
		expect(screen.getByRole('heading', { name: 'Kassentag bearbeiten' })).not.toBeNull();
	});
});

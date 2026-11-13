// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import SettingsPage from '../src/routes/admin/settings/+page.svelte';
import { getSettings, saveSettings } from '$lib/db';
import { DEFAULT_SETTINGS } from '$lib/types';

vi.mock('$lib/db', () => ({
	getSettings: vi.fn(),
	saveSettings: vi.fn()
}));
vi.mock('$lib/utils/backup', () => ({
	exportBackup: vi.fn(),
	importBackup: vi.fn()
}));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

it('saves percentage and euro quick-discount switches independently', async () => {
	vi.mocked(getSettings).mockResolvedValue({
		...DEFAULT_SETTINGS,
		quickDiscountAmounts: [9, 2, 3]
	});
	vi.mocked(saveSettings).mockResolvedValue(undefined);
	render(SettingsPage);

	const firstAmount = screen.getByRole('spinbutton', { name: 'Euro-Schnellrabatt 1' });
	await vi.waitFor(() => expect((firstAmount as HTMLInputElement).value).toBe('9'));
	const percentages = await screen.findByRole('checkbox', {
		name: 'Prozent-Schnellrabatte aktiv'
	});
	const amounts = screen.getByRole('checkbox', { name: 'Euro-Schnellrabatte aktiv' });
	expect((percentages as HTMLInputElement).checked).toBe(true);
	expect((amounts as HTMLInputElement).checked).toBe(true);

	await fireEvent.click(amounts);
	await fireEvent.input(firstAmount, {
		target: { value: '4.25' }
	});
	await fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

	await vi.waitFor(() =>
		expect(saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({
				quickDiscountPercentsEnabled: true,
				quickDiscountAmountsEnabled: false,
				quickDiscountAmounts: [4.25, 2, 3]
			})
		)
	);
});

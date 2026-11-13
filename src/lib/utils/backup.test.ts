import { describe, expect, it } from 'vitest';
import type { Product } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';
import { deleteProduct, getAllProducts, getSettings, saveProduct, saveSettings } from '$lib/db';
import { importBackup } from './backup';

const existingProduct: Product = {
	id: 'existing',
	name: 'Existing product',
	price: 2,
	purchasePrice: 1,
	category: 'Snacks',
	imageBlob: null,
	active: true,
	sortOrder: 0,
	createdAt: 1,
	stock: null
};

describe('importBackup', () => {
	it('preserves existing data when an imported product is invalid', async () => {
		for (const product of await getAllProducts()) {
			await deleteProduct(product.id);
		}

		const oldSettings = { ...DEFAULT_SETTINGS, shopName: 'Before import' };
		await saveSettings(oldSettings);
		await saveProduct(existingProduct);

		const file = {
			text: async () =>
				JSON.stringify({
					version: 1,
					exportedAt: 2,
					settings: { ...DEFAULT_SETTINGS, shopName: 'After import' },
					products: [
						{
							name: 'Missing ID',
							price: 3,
							purchasePrice: 1,
							category: 'Snacks',
							imageDataUrl: null,
							active: true,
							sortOrder: 0,
							createdAt: 2,
							stock: null
						}
					]
				})
		} as File;

		await expect(importBackup(file)).rejects.toThrow();

		expect(await getSettings()).toEqual(oldSettings);
		expect(await getAllProducts()).toEqual([existingProduct]);
	});
});

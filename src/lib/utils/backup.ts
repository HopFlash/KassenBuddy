import { getAllProducts, getSettings, replaceBackupData } from '$lib/db';
import type { Product, Settings } from '$lib/types';

interface BackupProduct extends Omit<Product, 'imageBlob'> {
	imageDataUrl: string | null;
}

interface BackupData {
	version: number;
	exportedAt: number;
	settings: Settings;
	products: BackupProduct[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
	const res = await fetch(dataUrl);
	return res.blob();
}

function isBackupProduct(value: unknown): value is BackupProduct {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const product = value as Record<string, unknown>;
	return (
		typeof product.id === 'string' &&
		product.id.length > 0 &&
		typeof product.name === 'string' &&
		Number.isFinite(product.price) &&
		(product.purchasePrice === undefined || Number.isFinite(product.purchasePrice)) &&
		typeof product.category === 'string' &&
		typeof product.active === 'boolean' &&
		Number.isFinite(product.sortOrder) &&
		Number.isFinite(product.createdAt) &&
		(product.stock === null || Number.isFinite(product.stock)) &&
		(product.imageDataUrl === null || typeof product.imageDataUrl === 'string')
	);
}

export async function exportBackup(): Promise<void> {
	const [products, settings] = await Promise.all([getAllProducts(), getSettings()]);

	const backupProducts: BackupProduct[] = await Promise.all(
		products.map(async ({ imageBlob, ...rest }) => ({
			...rest,
			imageDataUrl: imageBlob ? await blobToDataUrl(imageBlob) : null
		}))
	);

	const backup: BackupData = {
		version: 1,
		exportedAt: Date.now(),
		settings,
		products: backupProducts
	};

	const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `kassenbuddy_backup_${new Date().toISOString().slice(0, 10)}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export async function importBackup(file: File): Promise<void> {
	const text = await file.text();
	let backup: BackupData;

	try {
		backup = JSON.parse(text);
	} catch {
		throw new Error('Ungültige JSON-Datei');
	}

	if (
		!backup.version ||
		typeof backup.settings !== 'object' ||
		backup.settings === null ||
		Array.isArray(backup.settings) ||
		!Array.isArray(backup.products)
	) {
		throw new Error('Ungültiges Backup-Format');
	}
	if (backup.version !== 1) {
		throw new Error(`Unbekannte Backup-Version: ${backup.version}`);
	}

	const productIds = new Set<string>();
	for (const product of backup.products as unknown[]) {
		if (!isBackupProduct(product) || productIds.has(product.id)) {
			throw new Error('Ungültiges Produkt im Backup');
		}
		productIds.add(product.id);
	}

	const products: Product[] = await Promise.all(
		backup.products.map(async ({ imageDataUrl, ...rest }) => ({
			...rest,
			imageBlob: imageDataUrl ? await dataUrlToBlob(imageDataUrl) : null
		}))
	);

	await replaceBackupData(backup.settings, products);
}

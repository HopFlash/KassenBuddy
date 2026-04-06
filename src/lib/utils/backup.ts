import { getAllProducts, getSettings, saveProduct, saveSettings, deleteProduct } from '$lib/db';
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

	if (!backup.version || !backup.settings || !Array.isArray(backup.products)) {
		throw new Error('Ungültiges Backup-Format');
	}
	if (backup.version !== 1) {
		throw new Error(`Unbekannte Backup-Version: ${backup.version}`);
	}

	await saveSettings(backup.settings);

	const products: Product[] = await Promise.all(
		backup.products.map(async ({ imageDataUrl, ...rest }) => ({
			...rest,
			imageBlob: imageDataUrl ? await dataUrlToBlob(imageDataUrl) : null
		}))
	);

	const existing = await getAllProducts();
	await Promise.all(existing.map((p) => deleteProduct(p.id)));
	await Promise.all(products.map((p) => saveProduct(p)));
}

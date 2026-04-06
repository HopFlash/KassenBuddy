import { openDB, type IDBPDatabase } from 'idb';
import type { Product, Transaction, Settings } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

const DB_NAME = 'kasse-db';
const DB_VERSION = 1;

export type KasseDB = IDBPDatabase<{
	products: { key: string; value: Product; indexes: { 'by-category': string } };
	transactions: { key: string; value: Transaction; indexes: { 'by-timestamp': number } };
	settings: { key: string; value: Settings };
}>;

let dbInstance: KasseDB | null = null;

function normalizeQuickDiscountPercents(value: unknown): [number, number, number] {
	if (Array.isArray(value) && value.length >= 3) {
		const parsed = value.slice(0, 3).map((v) => Number(v));
		if (parsed.every((v) => Number.isFinite(v) && v > 0 && v <= 100)) {
			return [parsed[0], parsed[1], parsed[2]];
		}
	}
	return [...DEFAULT_SETTINGS.quickDiscountPercents] as [number, number, number];
}

function normalizeSettings(settings: Partial<Settings> | null | undefined): Settings {
	const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
	return {
		adminPin: String(merged.adminPin ?? DEFAULT_SETTINGS.adminPin),
		currency: String(merged.currency ?? DEFAULT_SETTINGS.currency),
		shopName: String(merged.shopName ?? DEFAULT_SETTINGS.shopName),
		quickDiscountPercents: normalizeQuickDiscountPercents(merged.quickDiscountPercents),
		drinkQuotaCounter: Number.isFinite(Number(merged.drinkQuotaCounter))
			? Math.trunc(Number(merged.drinkQuotaCounter))
			: DEFAULT_SETTINGS.drinkQuotaCounter,
		checkoutLayout: merged.checkoutLayout === 'classic' ? 'classic' : 'compact'
	};
}

export async function getDb(): Promise<KasseDB> {
	if (dbInstance) return dbInstance;

	dbInstance = (await openDB(DB_NAME, DB_VERSION, {
		upgrade(db) {
			const productStore = db.createObjectStore('products', { keyPath: 'id' });
			productStore.createIndex('by-category', 'category');

			const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
			txStore.createIndex('by-timestamp', 'timestamp');

			db.createObjectStore('settings');
		}
	})) as unknown as KasseDB;

	// Initialize default settings if not present
	const settings = await dbInstance.get('settings', 'main');
	if (!settings) {
		await dbInstance.put('settings', DEFAULT_SETTINGS, 'main');
	}

	// Load default products on fresh install
	const productCount = await dbInstance.count('products');
	if (productCount === 0) {
		await loadDefaults(dbInstance);
	}

	return dbInstance;
}

async function loadDefaults(db: KasseDB): Promise<void> {
	try {
		const { base } = await import('$app/paths');
		const res = await fetch(`${base}/default.json`);
		if (!res.ok) return;
		const data = await res.json();
		if (!Array.isArray(data.products)) return;

		const tx = db.transaction('products', 'readwrite');
		for (const p of data.products) {
			let imageBlob: Blob | null = null;
			if (p.imageDataUrl) {
				imageBlob = await (await fetch(p.imageDataUrl)).blob();
			}
			await tx.store.put({
				id: p.id,
				name: p.name,
				price: p.price,
				purchasePrice: p.purchasePrice ?? 0,
				category: p.category,
				imageBlob,
				active: p.active,
				sortOrder: p.sortOrder,
				createdAt: p.createdAt,
				stock: p.stock ?? null
			});
		}
		await tx.done;

		if (data.settings) {
			await db.put('settings', data.settings, 'main');
		}
	} catch {
		// Silently fail — app works without defaults
	}
}

// --- Products ---

export async function getAllProducts(): Promise<Product[]> {
	const db = await getDb();
	const products = await db.getAll('products');
	return products.sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getActiveProducts(): Promise<Product[]> {
	const all = await getAllProducts();
	return all.filter((p) => p.active);
}

export async function getProduct(id: string): Promise<Product | undefined> {
	const db = await getDb();
	return db.get('products', id);
}

export async function saveProduct(product: Product): Promise<void> {
	const db = await getDb();
	await db.put('products', product);
}

export async function deleteProduct(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('products', id);
}

// --- Transactions ---

export async function getAllTransactions(): Promise<Transaction[]> {
	const db = await getDb();
	const txs = await db.getAll('transactions');
	return txs.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getTransactionsByDateRange(from: number, to: number): Promise<Transaction[]> {
	const db = await getDb();
	const range = IDBKeyRange.bound(from, to);
	return db.getAllFromIndex('transactions', 'by-timestamp', range);
}

export async function saveTransaction(tx: Transaction): Promise<void> {
	const db = await getDb();
	await db.put('transactions', tx);
}

export async function deleteAllTransactions(): Promise<void> {
	const db = await getDb();
	await db.clear('transactions');
}

export async function deleteTransaction(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('transactions', id);
}

// --- Settings ---

export async function getSettings(): Promise<Settings> {
	const db = await getDb();
	const stored = await db.get('settings', 'main');
	return normalizeSettings(stored);
}

export async function saveSettings(settings: Settings): Promise<void> {
	const db = await getDb();
	await db.put('settings', normalizeSettings(settings), 'main');
}

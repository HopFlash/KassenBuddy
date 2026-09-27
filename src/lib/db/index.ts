import { openDB, type IDBPDatabase } from 'idb';
import type { Product, Transaction, Settings, Kassentag } from '$lib/types';
import { DEFAULT_SETTINGS, CATEGORIES } from '$lib/types';
import { generateId } from '$lib/utils/id';
import { startOfDay, endOfDay } from '$lib/utils/currency';

const DB_NAME = 'kasse-db';
const DB_VERSION = 2;

export type KasseDB = IDBPDatabase<{
	products: { key: string; value: Product; indexes: { 'by-category': string } };
	transactions: {
		key: string;
		value: Transaction;
		indexes: { 'by-timestamp': number; 'by-kassentag': string };
	};
	settings: { key: string; value: Settings };
	kassentage: { key: string; value: Kassentag };
}>;

let dbInstance: KasseDB | null = null;
let dbInitPromise: Promise<KasseDB> | null = null;
let migrationPromise: Promise<void> | null = null;

function normalizeQuickDiscountPercents(value: unknown): [number, number, number] {
	if (Array.isArray(value) && value.length >= 3) {
		const parsed = value.slice(0, 3).map((v) => Number(v));
		if (parsed.every((v) => Number.isFinite(v) && v > 0 && v <= 100)) {
			return [parsed[0], parsed[1], parsed[2]];
		}
	}
	return [...DEFAULT_SETTINGS.quickDiscountPercents] as [number, number, number];
}

function normalizeCategoryName(value: unknown): string {
	return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function categoriesEqual(a: string, b: string): boolean {
	return a.toLocaleLowerCase('de-DE') === b.toLocaleLowerCase('de-DE');
}

function normalizeCategories(value: unknown): string[] {
	const fallback = 'Sonstiges';
	const source = Array.isArray(value) ? value : CATEGORIES;
	const normalized: string[] = [];

	for (const raw of source) {
		const category = normalizeCategoryName(raw);
		if (!category) continue;
		if (!normalized.some((existing) => categoriesEqual(existing, category))) {
			normalized.push(category);
		}
	}

	if (!normalized.some((category) => categoriesEqual(category, fallback))) {
		normalized.push(fallback);
	}

	return normalized;
}

function normalizeSettings(settings: Partial<Settings> | null | undefined): Settings {
	const merged = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
	return {
		adminPin: String(merged.adminPin ?? DEFAULT_SETTINGS.adminPin),
		currency: String(merged.currency ?? DEFAULT_SETTINGS.currency),
		shopName: String(merged.shopName ?? DEFAULT_SETTINGS.shopName),
		quickDiscountPercents: normalizeQuickDiscountPercents(merged.quickDiscountPercents),
		categories: normalizeCategories(merged.categories),
		drinkQuotaCounter: Number.isFinite(Number(merged.drinkQuotaCounter))
			? Math.trunc(Number(merged.drinkQuotaCounter))
			: DEFAULT_SETTINGS.drinkQuotaCounter,
		checkoutLayout: merged.checkoutLayout === 'classic' ? 'classic' : 'compact'
	};
}

function localDayKey(timestamp: number): string {
	const date = new Date(timestamp);
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

async function runLegacyMigration(db: KasseDB): Promise<void> {
	const totalCount = await db.count('transactions');
	if (totalCount === 0) return;

	const assignedCount = await db.countFromIndex('transactions', 'by-kassentag');
	if (assignedCount >= totalCount) return;

	// The counts above are only a cheap preflight. Other tabs/module instances may migrate
	// concurrently, so the actual create/reuse decision re-reads both stores inside one
	// readwrite transaction; IndexedDB serializes overlapping readwrite transactions.
	const idbTransaction = db.transaction(['transactions', 'kassentage'], 'readwrite');
	const transactionStore = idbTransaction.objectStore('transactions');
	const kassentagStore = idbTransaction.objectStore('kassentage');

	const [allTransactions, existingKassentage] = await Promise.all([
		transactionStore.getAll(),
		kassentagStore.getAll()
	]);
	const unassigned = allTransactions.filter((transaction) => transaction.kassentagId == null);
	if (unassigned.length === 0) {
		await idbTransaction.done;
		return;
	}

	const transactionsByDay = new Map<string, Transaction[]>();
	for (const transaction of unassigned) {
		const key = localDayKey(transaction.timestamp);
		const group = transactionsByDay.get(key);
		if (group) group.push(transaction);
		else transactionsByDay.set(key, [transaction]);
	}

	const writes: Promise<unknown>[] = [];
	for (const dayTransactions of transactionsByDay.values()) {
		const reference = new Date(dayTransactions[0].timestamp);
		const startedAt = startOfDay(reference);
		const endedAt = endOfDay(reference);

		let kassentag = existingKassentage.find(
			(candidate) =>
				candidate.source === 'legacy' &&
				candidate.startedAt === startedAt &&
				candidate.endedAt === endedAt
		);
		if (!kassentag) {
			kassentag = {
				id: generateId(),
				startedAt,
				endedAt,
				status: 'closed',
				source: 'legacy'
			};
			existingKassentage.push(kassentag);
			writes.push(kassentagStore.put(kassentag));
		}

		for (const transaction of dayTransactions) {
			writes.push(transactionStore.put({ ...transaction, kassentagId: kassentag.id }));
		}
	}

	await Promise.all(writes);
	await idbTransaction.done;
}

async function migrateLegacyTransactionsIfNeeded(db: KasseDB): Promise<void> {
	if (migrationPromise) {
		await migrationPromise;
		return;
	}

	migrationPromise = runLegacyMigration(db);
	try {
		await migrationPromise;
	} finally {
		migrationPromise = null;
	}
}

export async function getDb(): Promise<KasseDB> {
	const db = await ensureDb();
	await migrateLegacyTransactionsIfNeeded(db);
	return db;
}

async function ensureDb(): Promise<KasseDB> {
	if (dbInstance) return dbInstance;
	if (dbInitPromise) return dbInitPromise;

	dbInitPromise = (async () => {
		const db = (await openDB(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion, _newVersion, transaction) {
				if (oldVersion < 1) {
					const productStore = db.createObjectStore('products', { keyPath: 'id' });
					productStore.createIndex('by-category', 'category');

					const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
					txStore.createIndex('by-timestamp', 'timestamp');

					db.createObjectStore('settings');
				}

				if (oldVersion < 2) {
					db.createObjectStore('kassentage', { keyPath: 'id' });

					const txStore = transaction.objectStore('transactions');
					txStore.createIndex('by-kassentag', 'kassentagId');
				}
			}
		})) as unknown as KasseDB;

		// Initialize default settings if not present
		const settings = await db.get('settings', 'main');
		if (!settings) {
			await db.put('settings', DEFAULT_SETTINGS, 'main');
		}

		// Load default products on fresh install
		const productCount = await db.count('products');
		if (productCount === 0) {
			await loadDefaults(db);
		}

		dbInstance = db;
		return db;
	})();

	try {
		return await dbInitPromise;
	} finally {
		dbInitPromise = null;
	}
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

/**
 * Persists a completed checkout (transaction + settings + stock decrements)
 * in a single IndexedDB transaction so the writes commit atomically and
 * without the round-trip latency of multiple sequential awaits.
 */
export async function commitCheckout(
	tx: Transaction,
	settingsUpdate: Settings | null,
	stockUpdates: { productId: string; quantity: number }[]
): Promise<void> {
	const db = await getDb();
	const idbTx = db.transaction(['transactions', 'settings', 'products'], 'readwrite');

	const writes: Promise<unknown>[] = [idbTx.objectStore('transactions').put(tx)];

	if (settingsUpdate) {
		writes.push(idbTx.objectStore('settings').put(settingsUpdate, 'main'));
	}

	if (stockUpdates.length > 0) {
		const productsStore = idbTx.objectStore('products');
		writes.push(
			...stockUpdates.map(async ({ productId, quantity }) => {
				const current = (await productsStore.get(productId)) as Product | undefined;
				if (current && current.stock !== null) {
					await productsStore.put({ ...current, stock: Math.max(0, current.stock - quantity) });
				}
			})
		);
	}

	await Promise.all(writes);
	await idbTx.done;
}

export async function deleteAllTransactions(): Promise<void> {
	const db = await getDb();
	await db.clear('transactions');
}

export async function deleteTransaction(id: string): Promise<void> {
	const db = await getDb();
	await db.delete('transactions', id);
}

// --- Kassentage ---

export async function getActiveKassentag(): Promise<Kassentag | null> {
	const db = await getDb();
	const all = await db.getAll('kassentage');
	return all.find((kassentag) => kassentag.status === 'open') ?? null;
}

export async function startKassentag(): Promise<Kassentag> {
	const db = await getDb();
	const idbTx = db.transaction('kassentage', 'readwrite');
	const store = idbTx.store;
	const all = await store.getAll();
	if (all.some((kassentag) => kassentag.status === 'open')) {
		await idbTx.done;
		throw new Error('Es läuft bereits ein Kassentag');
	}

	const kassentag: Kassentag = {
		id: generateId(),
		startedAt: Date.now(),
		endedAt: null,
		status: 'open',
		source: 'manual'
	};
	await store.put(kassentag);
	await idbTx.done;
	return kassentag;
}

export async function endKassentag(id: string): Promise<void> {
	const db = await getDb();
	const kassentag = await db.get('kassentage', id);
	if (!kassentag) {
		throw new Error('Kassentag nicht gefunden');
	}
	await db.put('kassentage', { ...kassentag, endedAt: Date.now(), status: 'closed' });
}

export async function getAllKassentage(): Promise<Kassentag[]> {
	const db = await getDb();
	const kassentage = await db.getAll('kassentage');
	return kassentage.sort((a, b) => b.startedAt - a.startedAt);
}

export async function updateKassentagTimes(
	id: string,
	startedAt: number,
	endedAt: number | null
): Promise<void> {
	if (endedAt !== null && startedAt >= endedAt) {
		throw new Error('Startzeit muss vor der Endzeit liegen');
	}

	const db = await getDb();
	const idbTx = db.transaction('kassentage', 'readwrite');
	const store = idbTx.store;
	const kassentage = await store.getAll();
	const kassentag = kassentage.find((candidate) => candidate.id === id);
	if (!kassentag) {
		await idbTx.done;
		throw new Error('Kassentag nicht gefunden');
	}

	if (
		endedAt === null &&
		kassentage.some((candidate) => candidate.id !== id && candidate.status === 'open')
	) {
		await idbTx.done;
		throw new Error('Es läuft bereits ein anderer Kassentag');
	}

	await store.put({
		...kassentag,
		startedAt,
		endedAt,
		status: endedAt === null ? 'open' : 'closed'
	});
	await idbTx.done;
}

export async function getTransactionsByKassentag(id: string): Promise<Transaction[]> {
	const db = await getDb();
	const transactions = await db.getAllFromIndex('transactions', 'by-kassentag', id);
	return transactions.sort((a, b) => b.timestamp - a.timestamp);
}

export async function findKassentagForTimestamp(timestamp: number): Promise<Kassentag | null> {
	const kassentage = await getAllKassentage();
	return (
		kassentage.find((kassentag) => {
			const end = kassentag.endedAt ?? Number.POSITIVE_INFINITY;
			return timestamp >= kassentag.startedAt && timestamp <= end;
		}) ?? null
	);
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

export async function getCategories(): Promise<string[]> {
	const settings = await getSettings();
	return settings.categories;
}

export async function saveCategories(categories: string[]): Promise<string[]> {
	const settings = await getSettings();
	const normalized = normalizeCategories(categories);
	await saveSettings({ ...settings, categories: normalized });
	return normalized;
}

export async function addCategory(name: string): Promise<string[]> {
	const category = normalizeCategoryName(name);
	if (!category) {
		throw new Error('Kategorie darf nicht leer sein');
	}

	const categories = await getCategories();
	if (categories.some((existing) => categoriesEqual(existing, category))) {
		throw new Error('Kategorie existiert bereits');
	}

	return saveCategories([...categories, category]);
}

export async function renameCategory(oldName: string, newName: string): Promise<string[]> {
	const oldCategory = normalizeCategoryName(oldName);
	const newCategory = normalizeCategoryName(newName);

	if (!oldCategory || !newCategory) {
		throw new Error('Kategoriename darf nicht leer sein');
	}
	if (categoriesEqual(oldCategory, 'Sonstiges')) {
		throw new Error('„Sonstiges“ kann nicht umbenannt werden');
	}

	const categories = await getCategories();
	const oldIndex = categories.findIndex((category) => categoriesEqual(category, oldCategory));
	if (oldIndex === -1) {
		throw new Error('Kategorie nicht gefunden');
	}

	const duplicate = categories.find(
		(category, index) => index !== oldIndex && categoriesEqual(category, newCategory)
	);
	if (duplicate) {
		throw new Error('Kategorie existiert bereits');
	}

	const updatedCategories = [...categories];
	updatedCategories[oldIndex] = newCategory;
	await saveCategories(updatedCategories);

	const products = await getAllProducts();
	const affected = products.filter((product) => categoriesEqual(product.category, oldCategory));
	await Promise.all(affected.map((product) => saveProduct({ ...product, category: newCategory })));

	return getCategories();
}

export async function deleteCategory(name: string): Promise<string[]> {
	const category = normalizeCategoryName(name);
	const fallback = 'Sonstiges';

	if (!category) {
		throw new Error('Kategorie darf nicht leer sein');
	}
	if (categoriesEqual(category, fallback)) {
		throw new Error('„Sonstiges“ kann nicht gelöscht werden');
	}

	const categories = await getCategories();
	const exists = categories.some((existing) => categoriesEqual(existing, category));
	if (!exists) {
		throw new Error('Kategorie nicht gefunden');
	}

	const updatedCategories = categories.filter((existing) => !categoriesEqual(existing, category));
	await saveCategories(updatedCategories);

	const products = await getAllProducts();
	const affected = products.filter((product) => categoriesEqual(product.category, category));
	await Promise.all(affected.map((product) => saveProduct({ ...product, category: fallback })));

	return getCategories();
}

export interface Product {
	id: string;
	name: string;
	price: number;
	purchasePrice?: number;
	category: string;
	imageBlob: Blob | null;
	active: boolean;
	sortOrder: number;
	createdAt: number;
	stock: number | null; // null = unbegrenzt
}

export interface CartItem {
	product: Product;
	quantity: number;
}

export interface TransactionItem {
	productId: string;
	productName: string;
	price: number;
	quantity: number;
	subtotal: number;
}

export interface Kassentag {
	id: string;
	startedAt: number;
	endedAt: number | null;
	status: 'open' | 'closed';
	source: 'manual' | 'legacy';
}

export interface Transaction {
	id: string;
	timestamp: number;
	items: TransactionItem[];
	total: number;
	amountPaid: number;
	change: number;
	paymentMethod: 'cash' | 'card';
	kassentagId: string | null;
}

export interface Settings {
	adminPin: string;
	currency: string;
	shopName: string;
	quickDiscountPercents: [number, number, number];
	categories: string[];
	drinkQuotaCounter: number;
	checkoutLayout: 'classic' | 'compact';
}

export const DEFAULT_SETTINGS: Settings = {
	adminPin: '1234',
	currency: 'EUR',
	shopName: 'KassenBuddy',
	quickDiscountPercents: [5, 10, 20],
	categories: ['Bier', 'Wein', 'Spirituosen', 'Softdrinks', 'Wasser', 'Cocktails', 'Snacks', 'Sonstiges'],
	drinkQuotaCounter: 0,
	checkoutLayout: 'compact'
};

export const CATEGORIES = [
	'Bier',
	'Wein',
	'Spirituosen',
	'Softdrinks',
	'Wasser',
	'Cocktails',
	'Snacks',
	'Sonstiges'
] as const;

export type Category = (typeof CATEGORIES)[number];

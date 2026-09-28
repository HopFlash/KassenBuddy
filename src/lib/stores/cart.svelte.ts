import type { CartItem, Product, TransactionItem, Transaction } from '$lib/types';
import { generateId } from '$lib/utils/id';
import { getSettings, commitCheckout } from '$lib/db';

let items = $state<CartItem[]>([]);
let subtotalValue = $state(0);
let countValue = $state(0);
let hasDiscountValue = $state(false);
let discountPercentValue = $state(0);

const DISCOUNT_ID_PREFIX = 'discount:';

function isDiscountProduct(product: Product): boolean {
	return product.id.startsWith(DISCOUNT_ID_PREFIX);
}

function getDiscountPercent(product: Product): number {
	if (!isDiscountProduct(product)) return 0;
	const parsed = Number.parseFloat(product.id.slice(DISCOUNT_ID_PREFIX.length));
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return parsed;
}

function roundToCents(value: number): number {
	return Math.round(value * 100) / 100;
}

function recomputeMeta(): void {
	let subtotal = 0;
	let count = 0;
	let hasDiscount = false;
	let discountPercent = 0;

	for (const item of items) {
		count += item.quantity;
		if (isDiscountProduct(item.product)) {
			hasDiscount = true;
			if (discountPercent <= 0) {
				discountPercent = getDiscountPercent(item.product);
			}
			continue;
		}
		subtotal += item.product.price * item.quantity;
	}

	subtotalValue = roundToCents(subtotal);
	countValue = count;
	hasDiscountValue = hasDiscount;
	discountPercentValue = discountPercent;
}

function createDiscountProduct(percent: number): Product {
	return {
		id: `${DISCOUNT_ID_PREFIX}${percent}`,
		name: `${percent}% Rabatt`,
		price: 0,
		purchasePrice: 0,
		category: 'Rabatt',
		imageBlob: null,
		active: true,
		sortOrder: 0,
		createdAt: Date.now(),
		stock: null
	};
}

export const cart = {
	get items() {
		return items;
	},

	get subtotal() {
		return subtotalValue;
	},

	get discountTotal() {
		if (!hasDiscountValue || discountPercentValue <= 0 || subtotalValue <= 0) return 0;

		const maxPercent = Math.min(discountPercentValue, 100);
		return -roundToCents((subtotalValue * maxPercent) / 100);
	},

	get hasDiscount() {
		return hasDiscountValue;
	},

	get total() {
		return roundToCents(subtotalValue + this.discountTotal);
	},

	get count() {
		return countValue;
	},

	add(product: Product) {
		if (isDiscountProduct(product)) {
			items = items.filter((i) => !isDiscountProduct(i.product));
			items.push({ product, quantity: 1 });
			recomputeMeta();
			return;
		}

		const existing = items.find((i) => i.product.id === product.id);
		if (existing) {
			existing.quantity++;
		} else {
			items.push({ product, quantity: 1 });
		}
		recomputeMeta();
	},

	addPercentageDiscount(percent: number) {
		if (percent <= 0 || percent > 100) return false;
		if (this.subtotal <= 0) return false;

		const discountProduct = createDiscountProduct(percent);
		this.add(discountProduct);
		return true;
	},

	getItemUnitPrice(item: CartItem) {
		if (!isDiscountProduct(item.product)) return item.product.price;
		const percent = getDiscountPercent(item.product);
		if (percent <= 0 || this.subtotal <= 0) return 0;
		const maxPercent = Math.min(percent, 100);
		return -roundToCents((this.subtotal * maxPercent) / 100);
	},

	getItemTotal(item: CartItem) {
		return roundToCents(this.getItemUnitPrice(item) * item.quantity);
	},

	isDiscountItem(item: CartItem) {
		return isDiscountProduct(item.product);
	},

	removeDiscount() {
		items = items.filter((i) => !isDiscountProduct(i.product));
		recomputeMeta();
	},

	remove(productId: string) {
		items = items.filter((i) => i.product.id !== productId);
		recomputeMeta();
	},

	increment(productId: string) {
		const item = items.find((i) => i.product.id === productId);
		if (!item || isDiscountProduct(item.product)) return;
		item.quantity++;
		recomputeMeta();
	},

	decrement(productId: string) {
		const item = items.find((i) => i.product.id === productId);
		if (!item) return;
		if (item.quantity <= 1) {
			this.remove(productId);
		} else {
			item.quantity--;
			recomputeMeta();
		}
	},

	clear() {
		items = [];
		recomputeMeta();
	},

	async checkout(amountPaid: number, paymentMethod: 'cash' | 'card' = 'cash'): Promise<Transaction> {
		const total = this.total;
		const txItems: TransactionItem[] = items.map((item) => ({
			productId: item.product.id,
			productName: item.product.name,
			price: this.getItemUnitPrice(item),
			quantity: item.quantity,
			subtotal: this.getItemTotal(item)
		}));

		const checkout: Omit<Transaction, 'kassentagId'> = {
			id: generateId(),
			timestamp: Date.now(),
			items: txItems,
			total,
			amountPaid,
			change: Math.round((amountPaid - total) * 100) / 100,
			paymentMethod
		};

		const soldDrinkCount = items
			.filter((item) => !isDiscountProduct(item.product))
			.reduce((sum, item) => sum + item.quantity, 0);

		let settingsUpdate = null;
		if (soldDrinkCount > 0) {
			const settings = await getSettings();
			settingsUpdate = { ...settings, drinkQuotaCounter: settings.drinkQuotaCounter - soldDrinkCount };
		}

		const stockUpdates = items
			.filter((item) => item.product.stock !== null)
			.map((item) => ({ productId: item.product.id, quantity: item.quantity }));

		const tx = await commitCheckout(checkout, settingsUpdate, stockUpdates);

		this.clear();
		return tx;
	}
};

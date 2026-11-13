import type { CartItem, Product, TransactionItem, Transaction } from '$lib/types';
import { generateId } from '$lib/utils/id';
import { getSettings, commitCheckout } from '$lib/db';
import { formatCurrency } from '$lib/utils/currency';

let items = $state<CartItem[]>([]);
let subtotalValue = $state(0);
let countValue = $state(0);
let hasDiscountValue = $state(false);
let discountValueValue = $state<DiscountValue | null>(null);

const DISCOUNT_ID_PREFIX = 'discount:';

type DiscountKind = 'percent' | 'amount';

interface DiscountValue {
	kind: DiscountKind;
	value: number;
}

function isDiscountProduct(product: Product): boolean {
	return product.id.startsWith(DISCOUNT_ID_PREFIX);
}

function getDiscountValue(product: Product): DiscountValue | null {
	if (!isDiscountProduct(product)) return null;

	const suffix = product.id.slice(DISCOUNT_ID_PREFIX.length);
	let kind: DiscountKind;
	let rawValue: string;

	if (suffix.startsWith('percent:')) {
		kind = 'percent';
		rawValue = suffix.slice('percent:'.length);
	} else if (suffix.startsWith('amount:')) {
		kind = 'amount';
		rawValue = suffix.slice('amount:'.length);
	} else if (!suffix.includes(':')) {
		kind = 'percent';
		rawValue = suffix;
	} else {
		return null;
	}

	const value = Number.parseFloat(rawValue);
	if (!Number.isFinite(value) || value <= 0) return null;
	return { kind, value };
}

function roundToCents(value: number): number {
	return Math.round(value * 100) / 100;
}

function calculateDiscountTotal(discount: DiscountValue | null, subtotal: number): number {
	if (!discount || subtotal <= 0) return 0;
	if (discount.kind === 'percent') {
		return -roundToCents((subtotal * Math.min(discount.value, 100)) / 100);
	}
	return -Math.min(roundToCents(discount.value), subtotal);
}

function recomputeMeta(): void {
	let subtotal = 0;
	let count = 0;
	let hasDiscount = false;
	let discount: DiscountValue | null = null;

	for (const item of items) {
		count += item.quantity;
		if (isDiscountProduct(item.product)) {
			hasDiscount = true;
			if (!discount) discount = getDiscountValue(item.product);
			continue;
		}
		subtotal += item.product.price * item.quantity;
	}

	subtotalValue = roundToCents(subtotal);
	countValue = count;
	hasDiscountValue = hasDiscount;
	discountValueValue = discount;
}

function createDiscountProduct(kind: DiscountKind, value: number): Product {
	return {
		id: `${DISCOUNT_ID_PREFIX}${kind}:${value}`,
		name: kind === 'percent' ? `${value}% Rabatt` : `${formatCurrency(value)} Rabatt`,
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
		return calculateDiscountTotal(discountValueValue, subtotalValue);
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

		this.add(createDiscountProduct('percent', percent));
		return true;
	},

	addFixedAmountDiscount(amount: number) {
		if (!Number.isFinite(amount) || amount <= 0 || roundToCents(amount) !== amount) return false;
		if (this.subtotal <= 0) return false;

		this.add(createDiscountProduct('amount', amount));
		return true;
	},

	getItemUnitPrice(item: CartItem) {
		if (!isDiscountProduct(item.product)) return item.product.price;
		return calculateDiscountTotal(getDiscountValue(item.product), this.subtotal);
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

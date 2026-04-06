import type { CartItem, Product, TransactionItem, Transaction } from '$lib/types';
import { generateId } from '$lib/utils/id';
import { saveTransaction, getProduct, saveProduct, getSettings, saveSettings } from '$lib/db';

let items = $state<CartItem[]>([]);

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
		return roundToCents(
			items
				.filter((item) => !isDiscountProduct(item.product))
				.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
		);
	},

	get discountTotal() {
		const discountItem = items.find((item) => isDiscountProduct(item.product));
		if (!discountItem) return 0;

		const percent = getDiscountPercent(discountItem.product);
		if (percent <= 0 || this.subtotal <= 0) return 0;

		const maxPercent = Math.min(percent, 100);
		return -roundToCents((this.subtotal * maxPercent) / 100);
	},

	get hasDiscount() {
		return items.some((item) => isDiscountProduct(item.product));
	},

	get total() {
		return roundToCents(this.subtotal + this.discountTotal);
	},

	get count() {
		return items.reduce((sum, item) => sum + item.quantity, 0);
	},

	add(product: Product) {
		if (isDiscountProduct(product)) {
			items = items.filter((i) => !isDiscountProduct(i.product));
			items.push({ product, quantity: 1 });
			return;
		}

		const existing = items.find((i) => i.product.id === product.id);
		if (existing) {
			existing.quantity++;
		} else {
			items.push({ product, quantity: 1 });
		}
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

	removeDiscount() {
		items = items.filter((i) => !isDiscountProduct(i.product));
	},

	remove(productId: string) {
		items = items.filter((i) => i.product.id !== productId);
	},

	increment(productId: string) {
		const item = items.find((i) => i.product.id === productId);
		if (!item || isDiscountProduct(item.product)) return;
		item.quantity++;
	},

	decrement(productId: string) {
		const item = items.find((i) => i.product.id === productId);
		if (!item) return;
		if (item.quantity <= 1) {
			this.remove(productId);
		} else {
			item.quantity--;
		}
	},

	clear() {
		items = [];
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

		const tx: Transaction = {
			id: generateId(),
			timestamp: Date.now(),
			items: txItems,
			total,
			amountPaid,
			change: Math.round((amountPaid - total) * 100) / 100,
			paymentMethod
		};

		await saveTransaction(tx);

		const soldDrinkCount = items
			.filter((item) => !isDiscountProduct(item.product))
			.reduce((sum, item) => sum + item.quantity, 0);

		if (soldDrinkCount > 0) {
			const settings = await getSettings();
			await saveSettings({
				...settings,
				drinkQuotaCounter: settings.drinkQuotaCounter - soldDrinkCount
			});
		}

		// Lagerbestand dekrementieren
		for (const item of items) {
			if (item.product.stock !== null) {
				const current = await getProduct(item.product.id);
				if (current && current.stock !== null) {
					await saveProduct({ ...current, stock: Math.max(0, current.stock - item.quantity) });
				}
			}
		}

		this.clear();
		return tx;
	}
};

<script lang="ts">
	import { onMount } from 'svelte';
	import { getSettings } from '$lib/db';
	import { cart } from '$lib/stores/cart.svelte';
	import type { Settings } from '$lib/types';
	import { formatCurrency } from '$lib/utils/currency';

	interface Props {
		oncheckout: () => void;
	}

	let { oncheckout }: Props = $props();

	let confirmClear = $state(false);
	let quickDiscounts = $state<Settings['quickDiscountPercents']>([5, 10, 20]);

	onMount(async () => {
		const settings = await getSettings();
		quickDiscounts = settings.quickDiscountPercents;
	});

	const overStockItems = $derived(
		cart.items.filter(
			(item) => item.product.price >= 0 && item.product.stock !== null && item.quantity > item.product.stock
		)
	);

	function handleClear() {
		if (confirmClear) {
			cart.clear();
			confirmClear = false;
		} else {
			confirmClear = true;
			setTimeout(() => (confirmClear = false), 3000);
		}
	}

	function applyDiscount(percent: number) {
		cart.addPercentageDiscount(percent);
	}
</script>

<div class="flex flex-col h-full">
	<h2 class="text-lg font-bold mb-3 flex items-center justify-between">
		<span>Warenkorb</span>
		{#if cart.count > 0}
			<span class="bg-accent text-white text-sm rounded-full px-2 py-0.5">{cart.count}</span>
		{/if}
	</h2>

	<!-- Cart items -->
	<div class="rounded-lg p-2 bg-surface-lighter mb-2">
		<p class="text-xs text-text-muted mb-2">Schnellrabatt</p>
		<div class="flex gap-2">
			{#each quickDiscounts as percent}
				<button
					type="button"
					class="flex-1 rounded-lg py-2 text-xs font-semibold bg-accent/15 text-accent hover:bg-accent/25 transition-colors disabled:opacity-40"
					onclick={() => applyDiscount(percent)}
					disabled={cart.subtotal <= 0}
				>
					{percent}%
				</button>
			{/each}
			<button
				type="button"
				class="rounded-lg px-3 py-2 text-xs font-semibold bg-danger/15 text-danger hover:bg-danger/25 transition-colors disabled:opacity-40"
				onclick={() => cart.removeDiscount()}
				disabled={!cart.hasDiscount}
			>
				Entf.
			</button>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto space-y-2 mb-3">
		{#each cart.items as item (item.product.id)}
			{@const isOver = item.product.stock !== null && item.quantity > item.product.stock}
			{@const isDiscount = item.product.price < 0}
			<div class="rounded-lg p-3 flex items-center gap-3 {isOver ? 'bg-warning/10 ring-1 ring-warning/40' : 'bg-surface-lighter'}">
				<div class="flex-1 min-w-0">
					<p class="font-semibold text-sm truncate">{item.product.name}</p>
					<p class="text-text-muted text-xs">
						{formatCurrency(cart.getItemUnitPrice(item))} × {item.quantity}
						{#if isDiscount}
							<span class="text-accent"> · Rabattposition</span>
						{/if}
						{#if isOver}
							<span class="text-warning"> ⚠ Lager: {item.product.stock}</span>
						{/if}
					</p>
				</div>
				<div class="flex items-center gap-1">
					<button
						type="button"
						class="w-8 h-8 rounded-lg bg-surface-light hover:bg-danger/30 text-danger flex items-center justify-center text-lg font-bold transition-colors"
						onclick={() => cart.decrement(item.product.id)}
					>
						−
					</button>
					<span class="w-8 text-center font-mono">{item.quantity}</span>
					{#if !isDiscount}
						<button
							type="button"
							class="w-8 h-8 rounded-lg bg-surface-light hover:bg-accent/30 text-accent flex items-center justify-center text-lg font-bold transition-colors"
							onclick={() => cart.increment(item.product.id)}
						>
							+
						</button>
					{/if}
				</div>
				<p class="font-bold text-sm w-20 text-right">{formatCurrency(cart.getItemTotal(item))}</p>
			</div>
		{:else}
			<div class="text-center text-text-muted py-8">
				<p class="text-3xl mb-2">🛒</p>
				<p class="text-sm">Warenkorb ist leer</p>
			</div>
		{/each}
	</div>

	<!-- Total & Actions -->
	<div class="border-t border-surface-lighter pt-3 space-y-2 shrink-0">
		<div class="flex justify-between items-center text-sm text-text-muted">
			<span>Zwischensumme</span>
			<span>{formatCurrency(cart.subtotal)}</span>
		</div>

		{#if cart.discountTotal < 0}
			<div class="flex justify-between items-center text-sm text-accent font-semibold">
				<span>Rabatt</span>
				<span>{formatCurrency(cart.discountTotal)}</span>
			</div>
		{/if}

		<div class="flex justify-between items-center text-xl font-bold">
			<span>Gesamt</span>
			<span class="text-accent">{formatCurrency(cart.total)}</span>
		</div>

		{#if overStockItems.length > 0}
			<div class="bg-warning/10 border border-warning/30 rounded-lg px-3 py-2 text-xs text-warning leading-snug">
				⚠ {overStockItems.length === 1
					? `„${overStockItems[0].product.name}" überschreitet den Lagerbestand`
					: `${overStockItems.length} Artikel überschreiten den Lagerbestand`}
			</div>
		{/if}

		<button
			type="button"
			class="w-full bg-success hover:bg-success/80 active:bg-success/60 text-white rounded-xl py-4 text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
			disabled={cart.items.length === 0}
			onclick={oncheckout}
		>
			Bezahlen
		</button>

		{#if cart.items.length > 0}
			<button
				type="button"
				class="w-full bg-surface-lighter hover:bg-danger/20 text-danger rounded-xl py-2 text-sm font-semibold transition-colors"
				onclick={handleClear}
			>
				{confirmClear ? 'Wirklich leeren?' : 'Warenkorb leeren'}
			</button>
		{/if}
	</div>
</div>

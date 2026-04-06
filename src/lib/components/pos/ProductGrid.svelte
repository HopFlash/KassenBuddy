<script lang="ts">
	import type { Product } from '$lib/types';
	import { getBlobUrl } from '$lib/utils/image';
	import { formatCurrency } from '$lib/utils/currency';

	type SortMode = 'default' | 'name' | 'price-asc' | 'price-desc';

	interface Props {
		products: Product[];
		onselect: (product: Product) => void;
	}

	let { products, onselect }: Props = $props();
	let activeCategory = $state<string | null>(null);
	let sortMode = $state<SortMode>('default');

	const categories = $derived(
		[...new Set(products.map((p) => p.category))].sort()
	);

	const filtered = $derived.by(() => {
		let list = activeCategory ? products.filter((p) => p.category === activeCategory) : [...products];
		if (sortMode === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'de'));
		else if (sortMode === 'price-asc') list.sort((a, b) => a.price - b.price);
		else if (sortMode === 'price-desc') list.sort((a, b) => b.price - a.price);
		return list;
	});
</script>

<!-- Toolbar: category filter + sort -->
<div class="flex items-center gap-3 mb-4 shrink-0 flex-wrap">
	<div class="flex gap-2 overflow-x-auto pb-1 flex-1 min-w-0">
		<button
			type="button"
			class="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors {activeCategory === null ? 'bg-accent text-white' : 'bg-surface-lighter text-text-muted hover:bg-surface-lighter/80'}"
			onclick={() => (activeCategory = null)}
		>
			Alle
		</button>
		{#each categories as cat}
			<button
				type="button"
				class="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors {activeCategory === cat ? 'bg-accent text-white' : 'bg-surface-lighter text-text-muted hover:bg-surface-lighter/80'}"
				onclick={() => (activeCategory = cat)}
			>
				{cat}
			</button>
		{/each}
	</div>
	<select
		bind:value={sortMode}
		class="bg-surface-lighter rounded-lg px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-accent shrink-0"
		aria-label="Sortierung"
	>
		<option value="default">Standard</option>
		<option value="name">Name A–Z</option>
		<option value="price-asc">Preis ↑</option>
		<option value="price-desc">Preis ↓</option>
	</select>
</div>

<!-- Product grid -->
<div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 overflow-y-auto flex-1 content-start pb-4">
	{#each filtered as product (product.id)}
		{@const imgUrl = getBlobUrl(product.id, product.imageBlob)}
		{@const outOfStock = product.stock !== null && product.stock <= 0}
		{@const lowStock = product.stock !== null && product.stock > 0 && product.stock <= 5}
		<button
			type="button"
			class="flex flex-col items-center rounded-xl p-3 transition-colors border border-transparent bg-surface-light hover:bg-surface-lighter active:bg-accent/30 active:border-accent {outOfStock ? 'opacity-60' : ''}"
			onclick={() => onselect(product)}
		>
			<div class="w-full aspect-square rounded-lg bg-surface-lighter mb-2 overflow-hidden flex items-center justify-center relative">
				{#if imgUrl}
					<img src={imgUrl} alt={product.name} class="w-full h-full object-cover" />
				{:else}
					<span class="text-3xl">🥤</span>
				{/if}
				{#if outOfStock}
					<div class="absolute bottom-0 inset-x-0 flex items-center justify-center bg-danger/80 py-0.5">
						<span class="text-xs font-bold text-white">Ausverkauft</span>
					</div>
				{/if}
			</div>
			<span class="text-sm font-semibold text-center leading-tight line-clamp-2">{product.name}</span>
			<span class="text-accent font-bold mt-1">{formatCurrency(product.price)}</span>
			{#if product.stock !== null}
				<span class="text-xs mt-0.5 {outOfStock ? 'text-danger' : lowStock ? 'text-warning' : 'text-text-muted'}">
					{outOfStock ? '0 Stk.' : `${product.stock} Stk.`}
				</span>
			{/if}
		</button>
	{/each}

	{#if filtered.length === 0}
		<div class="col-span-full text-center text-text-muted py-12">
			<p class="text-4xl mb-2">📦</p>
			<p>Keine Produkte vorhanden</p>
			<p class="text-sm mt-1">Füge Produkte im Admin-Bereich hinzu</p>
		</div>
	{/if}
</div>

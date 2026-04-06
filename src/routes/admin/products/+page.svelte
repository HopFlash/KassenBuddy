<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllProducts, saveProduct, deleteProduct } from '$lib/db';
	import { formatCurrency } from '$lib/utils/currency';
	import { generateId } from '$lib/utils/id';
	import { fileToBlob, getBlobUrl, revokeBlobUrl } from '$lib/utils/image';
	import type { Product } from '$lib/types';
	import { CATEGORIES } from '$lib/types';
	import Modal from '$lib/components/shared/Modal.svelte';

	let products = $state<Product[]>([]);
	let editProduct = $state<Product | null>(null);
	let showForm = $state(false);
	let confirmDeleteId = $state<string | null>(null);

	// Form state
	let formName = $state('');
	let formPrice = $state('');
	let formPurchasePrice = $state('');
	let formCategory = $state<string>(CATEGORIES[0]);
	let formSortOrder = $state('');
	let formActive = $state(true);
	let formTrackStock = $state(false);
	let formStock = $state('');
	let formImageBlob = $state<Blob | null>(null);
	let formImagePreview = $state<string | null>(null);
	let formImagePreviewUrl = $state<string | null>(null);

	function revokePreviewUrl() {
		if (formImagePreviewUrl) {
			URL.revokeObjectURL(formImagePreviewUrl);
			formImagePreviewUrl = null;
		}
	}

	function closeForm() {
		revokePreviewUrl();
		showForm = false;
	}

	onMount(loadProducts);

	async function loadProducts() {
		products = await getAllProducts();
	}

	function openNewForm() {
		revokePreviewUrl();
		editProduct = null;
		formName = '';
		formPrice = '';
		formPurchasePrice = '';
		formCategory = CATEGORIES[0];
		formSortOrder = String(products.length + 1);
		formActive = true;
		formTrackStock = false;
		formStock = '';
		formImageBlob = null;
		formImagePreview = null;
		showForm = true;
	}

	function openEditForm(product: Product) {
		revokePreviewUrl();
		editProduct = product;
		formName = product.name;
		formPrice = String(product.price).replace('.', ',');
		formPurchasePrice = product.purchasePrice != null ? String(product.purchasePrice).replace('.', ',') : '';
		formCategory = product.category;
		formSortOrder = String(product.sortOrder);
		formActive = product.active;
		formTrackStock = product.stock !== null;
		formStock = product.stock !== null ? String(product.stock) : '';
		formImageBlob = product.imageBlob;
		if (product.imageBlob) {
			formImagePreviewUrl = URL.createObjectURL(product.imageBlob);
			formImagePreview = formImagePreviewUrl;
		} else {
			formImagePreview = null;
		}
		showForm = true;
	}

	async function handleImageUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		formImageBlob = await fileToBlob(file);
		revokePreviewUrl();
		formImagePreviewUrl = URL.createObjectURL(formImageBlob);
		formImagePreview = formImagePreviewUrl;
	}

	async function handleSave() {
		const price = parseFloat(formPrice.replace(',', '.'));
		if (!formName.trim() || isNaN(price) || price < 0) return;
		const parsedPurchase = parseFloat(formPurchasePrice.replace(',', '.'));
		const purchasePrice = formPurchasePrice.trim() && !isNaN(parsedPurchase) && parsedPurchase >= 0
			? Math.round(parsedPurchase * 100) / 100
			: undefined;
		const parsedSortOrder = Number.parseInt(formSortOrder, 10);
		const sortOrder = Number.isNaN(parsedSortOrder) ? (editProduct?.sortOrder ?? products.length + 1) : Math.max(0, parsedSortOrder);

		const product: Product = {
			id: editProduct?.id ?? generateId(),
			name: formName.trim(),
			price: Math.round(price * 100) / 100,
			purchasePrice,
			category: formCategory,
			imageBlob: formImageBlob,
			active: formActive,
			sortOrder,
			createdAt: editProduct?.createdAt ?? Date.now(),
			stock: formTrackStock ? Math.max(0, parseInt(formStock) || 0) : null
		};

		await saveProduct(product);
		closeForm();
		await loadProducts();
	}

	async function handleDelete(id: string) {
		revokeBlobUrl(id);
		await deleteProduct(id);
		confirmDeleteId = null;
		await loadProducts();
	}

	async function toggleActive(product: Product) {
		await saveProduct({ ...product, active: !product.active });
		await loadProducts();
	}
</script>

<div class="flex items-center justify-between mb-6">
	<h1 class="text-2xl font-bold">Produkte</h1>
	<button
		type="button"
		class="bg-accent hover:bg-accent-hover text-white rounded-xl px-6 py-3 font-semibold transition-colors"
		onclick={openNewForm}
	>
		+ Neues Produkt
	</button>
</div>

<!-- Product list -->
<div class="space-y-2">
	{#each products as product (product.id)}
		{@const imgUrl = getBlobUrl(product.id, product.imageBlob)}
		<div class="bg-surface-light rounded-xl p-4 flex items-center gap-4 {product.active ? '' : 'opacity-50'}">
			<!-- Image -->
			<div class="w-14 h-14 rounded-lg bg-surface-lighter overflow-hidden flex items-center justify-center shrink-0">
				{#if imgUrl}
					<img src={imgUrl} alt={product.name} class="w-full h-full object-cover" />
				{:else}
					<span class="text-2xl">🥤</span>
				{/if}
			</div>

			<!-- Info -->
			<div class="flex-1 min-w-0">
				<p class="font-semibold truncate">{product.name}</p>
				<p class="text-text-muted text-sm">Sortierung: {product.sortOrder} · {product.category} · VK: {formatCurrency(product.price)}{#if product.purchasePrice != null} · EK: {formatCurrency(product.purchasePrice)} · <span class="{product.price > product.purchasePrice ? 'text-success' : 'text-danger'}">{Math.round(((product.price - product.purchasePrice) / product.purchasePrice) * 100)}%</span>{/if}{#if product.stock !== null} · Lager: <span class="{product.stock === 0 ? 'text-danger font-semibold' : product.stock <= 5 ? 'text-warning' : ''}">{product.stock}</span>{/if}</p>
			</div>

			<!-- Actions -->
			<div class="flex items-center gap-2 shrink-0">
				<button
					type="button"
					class="px-3 py-2 rounded-lg text-sm font-semibold transition-colors {product.active ? 'bg-success/20 text-success' : 'bg-surface-lighter text-text-muted'}"
					onclick={() => toggleActive(product)}
				>
					{product.active ? 'Aktiv' : 'Inaktiv'}
				</button>
				<button
					type="button"
					class="px-3 py-2 rounded-lg bg-surface-lighter hover:bg-accent/20 text-sm font-semibold transition-colors"
					onclick={() => openEditForm(product)}
				>
					Bearbeiten
				</button>
				{#if confirmDeleteId === product.id}
					<button
						type="button"
						class="px-3 py-2 rounded-lg bg-danger text-white text-sm font-semibold transition-colors"
						onclick={() => handleDelete(product.id)}
					>
						Wirklich?
					</button>
				{:else}
					<button
						type="button"
						class="px-3 py-2 rounded-lg bg-surface-lighter hover:bg-danger/20 text-danger text-sm font-semibold transition-colors"
						onclick={() => (confirmDeleteId = product.id)}
					>
						Löschen
					</button>
				{/if}
			</div>
		</div>
	{:else}
		<div class="text-center text-text-muted py-12">
			<p class="text-4xl mb-2">📦</p>
			<p>Noch keine Produkte angelegt</p>
		</div>
	{/each}
</div>

<!-- Edit/Create Modal -->
<Modal open={showForm} title={editProduct ? 'Produkt bearbeiten' : 'Neues Produkt'} onclose={closeForm} wide>
	<form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-4">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="name" class="block text-sm text-text-muted mb-1">Name</label>
				<input
					id="name"
					type="text"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={formName}
					required
				/>
			</div>
			<div>
				<label for="price" class="block text-sm text-text-muted mb-1">Verkaufspreis (€)</label>
				<input
					id="price"
					type="text"
					inputmode="decimal"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={formPrice}
					placeholder="2,50"
					required
				/>
			</div>
			<div>
				<label for="purchase-price" class="block text-sm text-text-muted mb-1">Einkaufspreis (€) <span class="text-xs opacity-60">optional</span></label>
				<input
					id="purchase-price"
					type="text"
					inputmode="decimal"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={formPurchasePrice}
					placeholder="1,20"
				/>
			</div>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="category" class="block text-sm text-text-muted mb-1">Kategorie</label>
				<select
					id="category"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={formCategory}
				>
					{#each CATEGORIES as cat}
						<option value={cat}>{cat}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="sort-order" class="block text-sm text-text-muted mb-1">Sortierwert</label>
				<input
					id="sort-order"
					type="number"
					min="0"
					step="1"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={formSortOrder}
					placeholder="z. B. 10"
				/>
				<p class="text-xs text-text-muted mt-1">Kleinere Werte erscheinen in der Kasse weiter oben.</p>
			</div>
			<div>
				<label for="image" class="block text-sm text-text-muted mb-1">Bild</label>
				<input
					id="image"
					type="file"
					accept="image/*"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-1 file:text-white file:font-semibold file:text-sm"
					onchange={handleImageUpload}
				/>
			</div>
		</div>

		{#if formImagePreview}
			<div class="w-24 h-24 rounded-xl overflow-hidden bg-surface-lighter">
				<img src={formImagePreview} alt="Vorschau" class="w-full h-full object-cover" />
			</div>
		{/if}

		<label class="flex items-center gap-3 cursor-pointer">
			<input type="checkbox" bind:checked={formActive} class="w-5 h-5 accent-accent" />
			<span class="text-sm">Produkt aktiv (in Kasse sichtbar)</span>
		</label>

		<label class="flex items-center gap-3 cursor-pointer">
			<input type="checkbox" bind:checked={formTrackStock} class="w-5 h-5 accent-accent" />
			<span class="text-sm">Lagerbestand verwalten</span>
		</label>

		{#if formTrackStock}
			<div>
				<label for="stock" class="block text-sm text-text-muted mb-1">Aktueller Lagerbestand (Stück)</label>
				<input
					id="stock"
					type="number"
					min="0"
					step="1"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={formStock}
					placeholder="0"
				/>
			</div>
		{/if}

		<div class="flex gap-3 pt-2">
			<button
				type="button"
				class="flex-1 bg-surface-lighter hover:bg-surface-lighter/80 rounded-xl py-3 font-semibold transition-colors"
				onclick={closeForm}
			>
				Abbrechen
			</button>
			<button
				type="submit"
				class="flex-1 bg-accent hover:bg-accent-hover text-white rounded-xl py-3 font-semibold transition-colors"
			>
				{editProduct ? 'Speichern' : 'Anlegen'}
			</button>
		</div>
	</form>
</Modal>

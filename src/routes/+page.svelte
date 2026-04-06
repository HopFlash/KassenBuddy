<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { getActiveProducts, getSettings } from '$lib/db';
	import { cart } from '$lib/stores/cart.svelte';
	import type { Product } from '$lib/types';
	import ProductGrid from '$lib/components/pos/ProductGrid.svelte';
	import Cart from '$lib/components/pos/Cart.svelte';
	import CheckoutModal from '$lib/components/pos/CheckoutModal.svelte';
	import CheckoutModalClassic from '$lib/components/pos/CheckoutModalClassic.svelte';
	import Calculator from '$lib/components/shared/Calculator.svelte';

	let products = $state<Product[]>([]);
	let checkoutOpen = $state(false);
	let calculatorOpen = $state(false);
	let drinkQuotaCounter = $state(0);
	let checkoutLayout = $state<'classic' | 'compact'>('compact');

	const quotaCounterClass = $derived.by(() => {
		if (drinkQuotaCounter <= 0) return 'bg-danger/20 text-danger';
		if (drinkQuotaCounter <= 20) return 'bg-warning/20 text-warning';
		return 'bg-success/20 text-success';
	});

	onMount(async () => {
		const [activeProducts, settings] = await Promise.all([getActiveProducts(), getSettings()]);
		products = activeProducts;
		drinkQuotaCounter = settings.drinkQuotaCounter;
		checkoutLayout = settings.checkoutLayout;
	});

	function handleSelect(product: Product) {
		cart.add(product);
	}

	function handleCheckoutComplete() {
		checkoutOpen = false;
		Promise.all([getActiveProducts(), getSettings()]).then(([p, settings]) => {
			products = p;
			drinkQuotaCounter = settings.drinkQuotaCounter;
			checkoutLayout = settings.checkoutLayout;
		});
	}
</script>

<div class="flex h-full">
	<!-- Left: Products -->
	<div class="flex-1 flex flex-col p-4 min-w-0">
		<!-- Header -->
		<div class="flex items-center justify-between mb-4 shrink-0">
			<h1 class="text-2xl font-bold">🧾 KassenBuddy</h1>
			<div class="flex items-center gap-2">
				<div class="rounded-xl px-3 py-2 text-sm font-bold {quotaCounterClass}" title="Verbleibendes Getränke-Kontingent">
					Kontingent: {drinkQuotaCounter}
				</div>
				<button
					type="button"
					class="bg-surface-light hover:bg-surface-lighter rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
					onclick={() => (calculatorOpen = true)}
				>
					🧮 Rechner
				</button>
				<a
					href="{base}/admin"
					class="bg-surface-light hover:bg-surface-lighter rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
				>
					⚙️ Admin
				</a>
			</div>
		</div>

		<ProductGrid {products} onselect={handleSelect} />
	</div>

	<!-- Right: Cart -->
	<div class="w-80 xl:w-96 bg-surface-light border-l border-surface-lighter p-4 flex flex-col shrink-0">
		<Cart oncheckout={() => (checkoutOpen = true)} />
	</div>
</div>

{#if checkoutLayout === 'classic'}
<CheckoutModalClassic
	bind:open={checkoutOpen}
	onclose={() => (checkoutOpen = false)}
	oncomplete={handleCheckoutComplete}
/>
{:else}
<CheckoutModal
	bind:open={checkoutOpen}
	onclose={() => (checkoutOpen = false)}
	oncomplete={handleCheckoutComplete}
/>
{/if}

<Calculator
	bind:open={calculatorOpen}
	onclose={() => (calculatorOpen = false)}
/>

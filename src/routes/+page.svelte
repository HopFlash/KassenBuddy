<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import {
		endKassentag,
		getActiveKassentag,
		getActiveProducts,
		getSettings,
		startKassentag
	} from '$lib/db';
	import { cart } from '$lib/stores/cart.svelte';
	import type { Kassentag, Product } from '$lib/types';
	import { formatKassentagLabel } from '$lib/utils/kassentag';
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
	let activeKassentag = $state<Kassentag | null>(null);
	let confirmEndKassentag = $state(false);
	let kassentagError = $state('');

	const quotaCounterClass = $derived.by(() => {
		if (drinkQuotaCounter <= 0) return 'bg-danger/20 text-danger';
		if (drinkQuotaCounter <= 20) return 'bg-warning/20 text-warning';
		return 'bg-success/20 text-success';
	});

	onMount(async () => {
		const [activeProducts, settings, kassentag] = await Promise.all([
			getActiveProducts(),
			getSettings(),
			getActiveKassentag()
		]);
		products = activeProducts;
		drinkQuotaCounter = settings.drinkQuotaCounter;
		checkoutLayout = settings.checkoutLayout;
		activeKassentag = kassentag;
	});

	function handleSelect(product: Product) {
		cart.add(product);
	}

	async function handleStartKassentag() {
		kassentagError = '';
		try {
			activeKassentag = await startKassentag();
		} catch (error) {
			kassentagError =
				error instanceof Error ? error.message : 'Kassentag konnte nicht gestartet werden';
		}
	}

	async function handleEndKassentag() {
		if (!activeKassentag) return;
		if (!confirmEndKassentag) {
			confirmEndKassentag = true;
			setTimeout(() => (confirmEndKassentag = false), 3000);
			return;
		}

		kassentagError = '';
		try {
			await endKassentag(activeKassentag.id);
			activeKassentag = null;
			confirmEndKassentag = false;
		} catch (error) {
			kassentagError =
				error instanceof Error ? error.message : 'Kassentag konnte nicht beendet werden';
		}
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

<div class="flex h-full min-h-0">
	<!-- Left: Products -->
	<div class="flex-1 flex flex-col p-4 min-w-0 min-h-0">
		<!-- Header -->
		<div class="flex items-center justify-between gap-3 mb-4 shrink-0">
			<h1 class="text-2xl font-bold">🧾 KassenBuddy</h1>
			<div class="flex items-center gap-2 flex-wrap justify-end">
				{#if activeKassentag}
					<div
						class="rounded-xl px-3 py-2 text-sm font-semibold bg-success/20 text-success"
						title="Aktiver Kassentag"
					>
						🟢 {formatKassentagLabel(activeKassentag)}
					</div>
					<button
						type="button"
						class="bg-surface-light hover:bg-danger/20 text-danger rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
						onclick={handleEndKassentag}
					>
						{confirmEndKassentag ? 'Wirklich beenden?' : 'Kassentag beenden'}
					</button>
				{:else}
					<button
						type="button"
						class="bg-accent hover:bg-accent-hover text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
						onclick={handleStartKassentag}
					>
						▶️ Kassentag starten
					</button>
				{/if}
				{#if kassentagError}
					<span class="text-xs text-danger" role="alert">{kassentagError}</span>
				{/if}
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
	<div class="w-80 xl:w-96 bg-surface-light border-l border-surface-lighter p-4 flex flex-col shrink-0 min-h-0">
		<Cart oncheckout={() => (checkoutOpen = true)} kassentagActive={!!activeKassentag} />
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

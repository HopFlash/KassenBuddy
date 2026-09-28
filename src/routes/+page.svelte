<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
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
	let kassentagPending = $state(false);
	let kassentagLoaded = $state(false);
	let loadError = $state('');
	let loading = $state(false);
	let retryIncludesKassentag = true;
	let confirmEndTimer: ReturnType<typeof setTimeout> | null = null;

	const quotaCounterClass = $derived.by(() => {
		if (drinkQuotaCounter <= 0) return 'bg-danger/20 text-danger';
		if (drinkQuotaCounter <= 20) return 'bg-warning/20 text-warning';
		return 'bg-success/20 text-success';
	});

	async function loadPosData(includeKassentag: boolean) {
		loading = true;
		loadError = '';
		try {
			const [activeProducts, settings, kassentag] = await Promise.all([
				getActiveProducts(),
				getSettings(),
				includeKassentag ? getActiveKassentag() : Promise.resolve(undefined)
			]);
			products = activeProducts;
			drinkQuotaCounter = settings.drinkQuotaCounter;
			checkoutLayout = settings.checkoutLayout;
			if (kassentag !== undefined) {
				activeKassentag = kassentag;
				kassentagLoaded = true;
			}
		} catch (error) {
			console.error('Kassendaten konnten nicht geladen werden', error);
			retryIncludesKassentag = includeKassentag || !kassentagLoaded;
			const detail = error instanceof Error ? error.message : String(error);
			loadError = `Kassendaten konnten nicht geladen werden: ${detail}`;
		} finally {
			loading = false;
		}
	}

	function retryLoad() {
		if (loading) return;
		void loadPosData(retryIncludesKassentag);
	}

	function clearConfirmEndTimer() {
		if (confirmEndTimer !== null) {
			clearTimeout(confirmEndTimer);
			confirmEndTimer = null;
		}
	}

	onMount(() => {
		void loadPosData(true);
	});

	onDestroy(clearConfirmEndTimer);

	function handleSelect(product: Product) {
		cart.add(product);
	}

	async function handleStartKassentag() {
		if (kassentagPending || !kassentagLoaded || activeKassentag) return;
		kassentagPending = true;
		kassentagError = '';
		try {
			activeKassentag = await startKassentag();
		} catch (error) {
			kassentagError =
				error instanceof Error ? error.message : 'Kassentag konnte nicht gestartet werden';
		} finally {
			kassentagPending = false;
		}
	}

	async function handleEndKassentag() {
		if (kassentagPending || !activeKassentag) return;
		if (!confirmEndKassentag) {
			confirmEndKassentag = true;
			clearConfirmEndTimer();
			confirmEndTimer = setTimeout(() => {
				confirmEndKassentag = false;
				confirmEndTimer = null;
			}, 3000);
			return;
		}

		kassentagPending = true;
		kassentagError = '';
		try {
			await endKassentag(activeKassentag.id);
			clearConfirmEndTimer();
			activeKassentag = null;
			confirmEndKassentag = false;
			checkoutOpen = false;
		} catch (error) {
			kassentagError =
				error instanceof Error ? error.message : 'Kassentag konnte nicht beendet werden';
		} finally {
			kassentagPending = false;
		}
	}

	function handleCheckoutComplete() {
		checkoutOpen = false;
		void loadPosData(false);
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
						class="bg-surface-light hover:bg-danger/20 text-danger rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						onclick={handleEndKassentag}
						disabled={kassentagPending}
					>
						{confirmEndKassentag ? 'Wirklich beenden?' : 'Kassentag beenden'}
					</button>
				{:else}
					<button
						type="button"
						class="bg-accent hover:bg-accent-hover text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
						onclick={handleStartKassentag}
						disabled={kassentagPending || !kassentagLoaded}
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

		{#if loadError}
			<div
				class="mb-4 shrink-0 flex items-center justify-between gap-3 rounded-xl bg-danger/15 px-4 py-3 text-sm text-danger"
			>
				<span role="alert">{loadError}</span>
				<button
					type="button"
					class="shrink-0 rounded-lg bg-danger/20 hover:bg-danger/30 px-3 py-2 font-semibold transition-colors disabled:opacity-40"
					onclick={retryLoad}
					disabled={loading}
				>
					Erneut laden
				</button>
			</div>
		{/if}

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
	kassentagActive={!!activeKassentag}
/>
{:else}
<CheckoutModal
	bind:open={checkoutOpen}
	onclose={() => (checkoutOpen = false)}
	oncomplete={handleCheckoutComplete}
	kassentagActive={!!activeKassentag}
/>
{/if}

<Calculator
	bind:open={calculatorOpen}
	onclose={() => (calculatorOpen = false)}
/>

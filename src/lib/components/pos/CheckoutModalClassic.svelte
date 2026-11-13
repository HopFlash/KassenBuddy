<script lang="ts">
	import NumPadClassic from '../shared/NumPadClassic.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { formatCurrency } from '$lib/utils/currency';

	interface Props {
		open: boolean;
		onclose: () => void;
		oncomplete: () => void;
		kassentagActive: boolean;
	}

	let { open = $bindable(), onclose, oncomplete, kassentagActive }: Props = $props();

	const INACTIVE_MESSAGE = 'Kein aktiver Kassentag – Zahlung nicht möglich. Bitte zuerst Kassentag starten.';

	let paymentMethod = $state<'cash' | 'card'>('cash');
	let numpadValue = $state('');
	let result: { total: number; paid: number; change: number; method: 'cash' | 'card' } | null = $state(null);
	let processing = $state(false);
	let paymentError = $state('');

	const errorMessage = $derived(kassentagActive ? paymentError : INACTIVE_MESSAGE);
	const payDisabled = $derived(processing || !kassentagActive);

	function reset() {
		numpadValue = '';
		result = null;
		processing = false;
		paymentError = '';
		paymentMethod = 'cash';
	}

	async function handleConfirm(amount: number) {
		if (processing) return;
		if (!kassentagActive) {
			paymentError = INACTIVE_MESSAGE;
			return;
		}
		if (paymentMethod === 'cash' && amount < cart.total) return;
		paymentError = '';
		processing = true;
		const method = paymentMethod;
		try {
			const tx = await cart.checkout(amount, method);
			result = { total: tx.total, paid: tx.amountPaid, change: tx.change, method };
		} catch (error) {
			console.error('Checkout failed', error);
			const detail = error instanceof Error ? error.message : String(error);
			paymentError = `Zahlung fehlgeschlagen: ${detail}`;
		} finally {
			processing = false;
		}
	}

	async function handleCardPay() {
		await handleConfirm(cart.total);
	}

	function handleDone() {
		reset();
		oncomplete();
	}

	function handleClose() {
		reset();
		onclose();
	}

	const parsedAmount = $derived(parseFloat(numpadValue.replace(',', '.')) || 0);
	const changePreview = $derived(parsedAmount - cart.total);
</script>

<Modal {open} title="Bezahlen" onclose={handleClose} fit>
	{#if result}
		<!-- Success screen -->
		<div class="flex flex-col items-center justify-center h-full min-h-0 gap-2 sm:gap-3 text-center">
			<p class="text-4xl sm:text-5xl">{result.method === 'card' ? '💳' : '✅'}</p>
			<p class="text-base sm:text-lg text-text-muted">Bezahlt · {result.method === 'card' ? 'Kartenzahlung' : 'Barzahlung'}</p>
			<p class="text-sm text-text-muted">Summe: {formatCurrency(result.total)}</p>
			{#if result.method === 'cash'}
				<p class="text-sm text-text-muted">Erhalten: {formatCurrency(result.paid)}</p>
				<div class="w-full bg-success/20 rounded-xl p-3 sm:p-4">
					<p class="text-sm text-success">Rückgeld</p>
					<p class="text-3xl sm:text-4xl font-bold text-success">{formatCurrency(result.change)}</p>
				</div>
			{:else}
				<div class="w-full bg-success/20 rounded-xl p-3 sm:p-4">
					<p class="text-4xl font-bold text-success">✓</p>
				</div>
			{/if}
			<button
				type="button"
				class="w-full min-h-12 bg-accent hover:bg-accent-hover text-white rounded-xl py-3 text-base sm:text-lg font-bold transition-colors"
				onclick={handleDone}
			>
				Fertig
			</button>
		</div>
	{:else}
		{#if errorMessage}
			<p class="shrink-0 mb-1.5 rounded-lg bg-danger/15 px-3 py-2 text-sm font-semibold text-danger text-center" role="alert">
				{errorMessage}
			</p>
		{/if}
		<div class="flex flex-col h-full min-h-0 gap-1.5 sm:gap-2.5">
			<!-- Amount -->
			<div class="text-center shrink-0">
				<p class="text-text-muted text-sm">Zu zahlen</p>
				<p class="text-2xl sm:text-3xl font-bold text-accent">{formatCurrency(cart.total)}</p>
			</div>

			<!-- Payment method toggle -->
			<div class="grid grid-cols-2 gap-1.5 sm:gap-2 shrink-0">
				<button
					type="button"
					class="rounded-xl min-h-11 py-2.5 text-sm sm:text-base font-semibold transition-colors border-2 {paymentMethod === 'cash' ? 'border-accent bg-accent/20 text-accent' : 'border-surface-lighter bg-surface-lighter text-text-muted'}"
					onclick={() => { paymentMethod = 'cash'; numpadValue = ''; }}
				>
					💵 Bargeld
				</button>
				<button
					type="button"
					class="rounded-xl min-h-11 py-2.5 text-sm sm:text-base font-semibold transition-colors border-2 {paymentMethod === 'card' ? 'border-accent bg-accent/20 text-accent' : 'border-surface-lighter bg-surface-lighter text-text-muted'}"
					onclick={() => { paymentMethod = 'card'; numpadValue = ''; }}
				>
					💳 Karte
				</button>
			</div>

			{#if paymentMethod === 'cash'}
				<!-- Change preview -->
				{#if numpadValue && parsedAmount !== 0}
					<div class="shrink-0 text-center rounded-xl p-2.5 sm:p-3 {changePreview >= 0 ? 'bg-success/10' : 'bg-danger/10'}">
						<p class="text-sm {changePreview >= 0 ? 'text-success' : 'text-danger'}">
							{changePreview >= 0 ? 'Rückgeld' : 'Fehlbetrag'}
						</p>
						<p class="text-xl sm:text-2xl font-bold {changePreview >= 0 ? 'text-success' : 'text-danger'}">
							{formatCurrency(Math.abs(changePreview))}
						</p>
					</div>
				{/if}

				<div class="flex-1 min-h-0">
					<NumPadClassic
						bind:value={numpadValue}
						onconfirm={handleConfirm}
						oncancel={handleClose}
						label="Erhaltener Betrag (€)"
					/>
				</div>

				<button
					type="button"
					class="w-full shrink-0 min-h-11 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					onclick={() => handleConfirm(cart.total)}
					disabled={payDisabled}
				>
					Passend bezahlt ({formatCurrency(cart.total)})
				</button>
			{:else}
				<!-- Card payment -->
				<div class="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 sm:gap-4">
					<p class="text-text-muted text-sm text-center">Karte an das Terminal halten oder einstecken</p>
					<p class="text-4xl sm:text-5xl">💳</p>
				</div>
				<button
					type="button"
					class="w-full shrink-0 min-h-12 bg-success hover:bg-success/80 text-white rounded-xl py-3 text-base sm:text-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
					onclick={handleCardPay}
					disabled={payDisabled}
				>
					{processing ? 'Verarbeite…' : `Kartenzahlung bestätigen · ${formatCurrency(cart.total)}`}
				</button>
			{/if}
		</div>
	{/if}
</Modal>

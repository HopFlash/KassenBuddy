<script lang="ts">
	import NumPad from '$lib/components/shared/NumPad.svelte';
	import Modal from '$lib/components/shared/Modal.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { formatCurrency } from '$lib/utils/currency';

	interface Props {
		open: boolean;
		onclose: () => void;
		oncomplete: () => void;
	}

	let { open = $bindable(), onclose, oncomplete }: Props = $props();

	let paymentMethod = $state<'cash' | 'card'>('cash');
	let numpadValue = $state('');
	let result: { total: number; paid: number; change: number; method: 'cash' | 'card' } | null = $state(null);
	let processing = $state(false);

	function reset() {
		numpadValue = '';
		result = null;
		processing = false;
		paymentMethod = 'cash';
	}

	async function handleConfirm(amount: number) {
		if (paymentMethod === 'cash' && amount < cart.total) return;
		processing = true;
		const tx = await cart.checkout(amount, paymentMethod);
		result = { total: tx.total, paid: tx.amountPaid, change: tx.change, method: paymentMethod };
		processing = false;
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
		<div class="flex flex-col h-full min-h-0 gap-1.5 sm:gap-2.5 {paymentMethod === 'cash' ? 'landscape:flex-row landscape:gap-3' : ''}">
			<!-- Info panel: top in portrait, left side in landscape (cash) -->
			<div class="flex flex-col gap-1.5 {paymentMethod === 'cash' ? 'landscape:w-[40%] landscape:shrink-0 landscape:min-h-0' : ''}">
				<!-- Amount -->
				<div class="text-center shrink-0 {paymentMethod === 'cash' ? 'landscape:text-left' : ''}">
					<p class="text-text-muted text-xs sm:text-sm leading-tight">Zu zahlen</p>
					<p class="text-xl sm:text-3xl font-bold text-accent leading-tight {paymentMethod === 'cash' ? 'landscape:text-2xl' : ''}">{formatCurrency(cart.total)}</p>
				</div>

				<!-- Payment method toggle -->
				<div class="grid grid-cols-2 gap-1.5 sm:gap-2 shrink-0">
					<button
						type="button"
						class="rounded-xl min-h-9 sm:min-h-11 py-1.5 sm:py-2.5 text-sm sm:text-base font-semibold transition-colors border-2 {paymentMethod === 'cash' ? 'border-accent bg-accent/20 text-accent' : 'border-surface-lighter bg-surface-lighter text-text-muted'}"
						onclick={() => { paymentMethod = 'cash'; numpadValue = ''; }}
					>
						💵 Bargeld
					</button>
					<button
						type="button"
						class="rounded-xl min-h-9 sm:min-h-11 py-1.5 sm:py-2.5 text-sm sm:text-base font-semibold transition-colors border-2 {paymentMethod === 'card' ? 'border-accent bg-accent/20 text-accent' : 'border-surface-lighter bg-surface-lighter text-text-muted'}"
						onclick={() => { paymentMethod = 'card'; numpadValue = ''; }}
					>
						💳 Karte
					</button>
				</div>

				{#if paymentMethod === 'cash'}
					<!-- Landscape-only: change preview + actions -->
					<div class="hidden landscape:flex flex-col gap-1 flex-1 min-h-0">
						{#if numpadValue && parsedAmount !== 0}
							<div class="shrink-0 text-center rounded-lg p-1 {changePreview >= 0 ? 'bg-success/10' : 'bg-danger/10'}">
								<p class="text-xs {changePreview >= 0 ? 'text-success' : 'text-danger'}">
									{changePreview >= 0 ? 'Rückgeld' : 'Fehlbetrag'}
								</p>
								<p class="text-base font-bold {changePreview >= 0 ? 'text-success' : 'text-danger'}">
									{formatCurrency(Math.abs(changePreview))}
								</p>
							</div>
						{/if}
						<div class="mt-auto flex flex-col gap-1">
							<div class="grid grid-cols-4 gap-1">
								{#each [5, 10, 20, 50] as amount}
									<button
										type="button"
										class="bg-accent/20 hover:bg-accent/30 active:bg-accent text-accent rounded-lg min-h-9 py-1 text-xs font-semibold transition-colors"
										onclick={() => {
											const amountValue = String(amount).replace('.', ',');
											numpadValue = numpadValue.startsWith('-') ? `-${amountValue}` : amountValue;
										}}
									>
										{amount}€
									</button>
								{/each}
							</div>
							<button
								type="button"
								class="w-full min-h-9 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg py-1 text-sm font-semibold transition-colors"
								onclick={() => handleConfirm(cart.total)}
								disabled={processing}
							>
								Passend ({formatCurrency(cart.total)})
							</button>
							<div class="grid grid-cols-2 gap-1">
								<button
									type="button"
									class="bg-surface-lighter hover:bg-danger/30 text-danger rounded-lg min-h-9 py-1 text-sm font-semibold transition-colors"
									onclick={handleClose}
								>
									Abbrechen
								</button>
								<button
									type="button"
									class="bg-success hover:bg-success/80 text-white rounded-lg min-h-9 py-1 text-sm font-semibold transition-colors disabled:opacity-40"
									disabled={!numpadValue || parsedAmount === 0}
									onclick={() => handleConfirm(parsedAmount)}
								>
									Bestätigen
								</button>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Main content -->
			{#if paymentMethod === 'cash'}
				<!-- Portrait: change preview -->
				{#if numpadValue && parsedAmount !== 0}
					<div class="shrink-0 text-center rounded-lg p-1.5 sm:p-2.5 landscape:hidden {changePreview >= 0 ? 'bg-success/10' : 'bg-danger/10'}">
						<p class="text-xs sm:text-sm {changePreview >= 0 ? 'text-success' : 'text-danger'}">
							{changePreview >= 0 ? 'Rückgeld' : 'Fehlbetrag'}
						</p>
						<p class="text-lg sm:text-xl font-bold {changePreview >= 0 ? 'text-success' : 'text-danger'}">
							{formatCurrency(Math.abs(changePreview))}
						</p>
					</div>
				{/if}

				<div class="flex-1 min-h-0">
					<NumPad
						bind:value={numpadValue}
						onconfirm={handleConfirm}
						oncancel={handleClose}
						label="Erhaltener Betrag (€)"
					/>
				</div>

				<!-- Portrait: passend button -->
				<button
					type="button"
					class="w-full shrink-0 min-h-9 sm:min-h-11 bg-accent/20 hover:bg-accent/30 text-accent rounded-lg py-1.5 sm:py-2.5 text-sm font-semibold transition-colors landscape:hidden"
					onclick={() => handleConfirm(cart.total)}
					disabled={processing}
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
					class="w-full shrink-0 min-h-12 bg-success hover:bg-success/80 text-white rounded-xl py-3 text-base sm:text-lg font-bold transition-colors"
					onclick={handleCardPay}
					disabled={processing}
				>
					{processing ? 'Verarbeite…' : `Kartenzahlung bestätigen · ${formatCurrency(cart.total)}`}
				</button>
			{/if}
		</div>
	{/if}
</Modal>


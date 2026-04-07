<!-- Reusable numeric pad for payment input -->
<script lang="ts">
	interface Props {
		value: string;
		onconfirm: (amount: number) => void;
		oncancel: () => void;
		label?: string;
	}

	let { value = $bindable(''), onconfirm, oncancel, label = 'Bezahlt (€)' }: Props = $props();

	function press(key: string) {
		if (key === 'C') {
			value = '';
		} else if (key === '⌫') {
			value = value.slice(0, -1);
		} else if (key === ',') {
			if (!value.includes(',')) {
				value += value === '' || value === '-' ? '0,' : ',';
			}
		} else {
			// Limit decimal places to 2
			const parts = value.split(',');
			if (parts[1] !== undefined && parts[1].length >= 2) return;
			value += key;
		}
	}

	function toggleSign() {
		if (!value) {
			value = '-';
			return;
		}
		value = value.startsWith('-') ? value.slice(1) : `-${value}`;
	}

	function confirm() {
		const parsed = parseFloat(value.replace(',', '.'));
		if (!isNaN(parsed) && parsed !== 0) {
			onconfirm(parsed);
		}
	}

	const buttons = ['7', '8', '9', '4', '5', '6', '1', '2', '3', ',', '0', '⌫'];
</script>

<div class="flex flex-col gap-1.5 sm:gap-2 landscape:gap-1 h-full">
	<p class="text-sm text-text-muted shrink-0 landscape:hidden">{label}</p>
	<div class="bg-surface-lighter rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 landscape:py-1 text-right text-xl sm:text-2xl landscape:text-lg font-mono min-h-10 sm:min-h-12 landscape:min-h-8 shrink-0">
		{value || '0'} €
	</div>

	<div class="grid grid-cols-2 gap-1.5 sm:gap-2 mt-1 shrink-0">
		<button
			type="button"
			class="bg-surface-light hover:bg-surface-lighter active:bg-accent rounded-lg min-h-9 sm:min-h-10 py-1.5 text-sm font-semibold transition-colors"
			onclick={toggleSign}
		>
			+ / -
		</button>
		<button
			type="button"
			class="bg-surface-light hover:bg-surface-lighter active:bg-accent rounded-lg min-h-9 sm:min-h-10 py-1.5 text-sm font-semibold transition-colors"
			onclick={() => { value = ''; }}
		>
			C
		</button>
	</div>

	<div class="flex-1 min-h-0 grid grid-cols-3 grid-rows-4 gap-1.5 sm:gap-2 landscape:gap-1 mt-1 landscape:mt-0 rounded-lg border border-surface-lighter p-1 sm:p-1.5">
		{#each buttons as btn}
			<button
				type="button"
				class="bg-surface-light border border-surface-lighter hover:bg-surface-lighter active:bg-accent rounded-lg min-h-10 sm:min-h-12 text-lg sm:text-xl font-semibold transition-colors"
				onclick={() => press(btn)}
			>
				{btn}
			</button>
		{/each}
	</div>

	<!-- Quick amounts -->
	<div class="grid grid-cols-4 gap-1.5 sm:gap-2 mt-1 sm:mt-2 shrink-0 landscape:hidden">
		{#each [5, 10, 20, 50] as amount}
			<button
				type="button"
				class="bg-accent/20 hover:bg-accent/30 active:bg-accent text-accent rounded-lg min-h-9 sm:min-h-11 py-1.5 sm:py-2 text-sm font-semibold transition-colors"
				onclick={() => {
					const amountValue = String(amount).replace('.', ',');
					value = value.startsWith('-') ? `-${amountValue}` : amountValue;
				}}
			>
				{amount} €
			</button>
		{/each}
	</div>

	<div class="grid grid-cols-2 gap-1.5 sm:gap-2 mt-1 sm:mt-2 shrink-0 landscape:hidden">
		<button
			type="button"
			class="bg-surface-lighter hover:bg-danger/30 text-danger rounded-lg min-h-10 sm:min-h-12 py-2 sm:py-2.5 text-base sm:text-lg font-semibold transition-colors"
			onclick={() => { value = ''; oncancel(); }}
		>
			Abbrechen
		</button>
		<button
			type="button"
			class="bg-success hover:bg-success/80 text-white rounded-lg min-h-10 sm:min-h-12 py-2 sm:py-2.5 text-base sm:text-lg font-semibold transition-colors disabled:opacity-40"
			disabled={!value || isNaN(parseFloat(value.replace(',', '.'))) || parseFloat(value.replace(',', '.')) === 0}
			onclick={confirm}
		>
			Bestätigen
		</button>
	</div>
</div>

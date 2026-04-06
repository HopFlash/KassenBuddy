<script lang="ts">
	import Modal from '$lib/components/shared/Modal.svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open = $bindable(), onclose }: Props = $props();

	let display = $state('0');
	let previousValue = $state<number | null>(null);
	let operator = $state<string | null>(null);
	let resetNext = $state(false);

	function press(key: string) {
		if (resetNext && key !== '=' && key !== 'C' && !isOp(key)) {
			display = key;
			resetNext = false;
			return;
		}

		if (key === 'C') {
			display = '0';
			previousValue = null;
			operator = null;
			resetNext = false;
		} else if (key === '⌫') {
			display = display.length > 1 ? display.slice(0, -1) : '0';
		} else if (key === ',') {
			if (!display.includes(',')) display += ',';
		} else if (isOp(key)) {
			calculate();
			previousValue = parseDisplay();
			operator = key;
			resetNext = true;
		} else if (key === '=') {
			calculate();
			operator = null;
			resetNext = true;
		} else {
			if (display === '0') {
				display = key;
			} else {
				display += key;
			}
		}
	}

	function isOp(key: string): boolean {
		return ['+', '−', '×', '÷'].includes(key);
	}

	function parseDisplay(): number {
		return parseFloat(display.replace(',', '.')) || 0;
	}

	function calculate() {
		if (previousValue === null || !operator) return;
		const current = parseDisplay();
		let result: number;

		switch (operator) {
			case '+': result = previousValue + current; break;
			case '−': result = previousValue - current; break;
			case '×': result = previousValue * current; break;
			case '÷': result = current !== 0 ? previousValue / current : 0; break;
			default: return;
		}

		display = String(Math.round(result * 100) / 100).replace('.', ',');
		previousValue = null;
	}

	const buttons: { label: string; cols?: number }[] = [
		{ label: 'C', cols: 2 }, { label: '⌫' }, { label: '÷' },
		{ label: '7' }, { label: '8' }, { label: '9' }, { label: '×' },
		{ label: '4' }, { label: '5' }, { label: '6' }, { label: '−' },
		{ label: '1' }, { label: '2' }, { label: '3' }, { label: '+' },
		{ label: '0', cols: 2 }, { label: ',' }, { label: '=' },
	];

	function btnClass(btn: string): string {
		if (btn === 'C') return 'bg-danger/30 text-danger';
		if (btn === '=') return 'bg-success text-white';
		if (isOp(btn) || btn === '⌫') return 'bg-accent/20 text-accent';
		return 'bg-surface-lighter';
	}
</script>

<Modal {open} title="Taschenrechner" onclose={onclose}>
	<div class="flex flex-col gap-2">
		<div class="bg-surface-lighter rounded-lg px-4 py-4 text-right text-3xl font-mono min-h-14">
			{display}
			{#if operator}
				<span class="text-text-muted text-lg ml-2">{operator}</span>
			{/if}
		</div>

		<div class="grid grid-cols-4 gap-2 mt-2">
			{#each buttons as btn}
				<button
					type="button"
					class="rounded-lg py-4 text-xl font-semibold transition-colors hover:opacity-80 active:opacity-60 {btnClass(btn.label)} {btn.cols === 2 ? 'col-span-2' : ''}"
					onclick={() => press(btn.label)}
				>
					{btn.label}
				</button>
			{/each}
		</div>
	</div>
</Modal>

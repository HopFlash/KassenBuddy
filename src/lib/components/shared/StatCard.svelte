<script lang="ts">
	interface Props {
		label: string;
		value: string | number;
		sub?: string;
		valueClass?: string;
		pad?: 'sm' | 'md';
	}

	let { label, value, sub, valueClass = '', pad = 'md' }: Props = $props();
</script>

<div class="bg-surface-light rounded-xl {pad === 'sm' ? 'p-4' : 'p-6'}">
	<p class="text-text-muted text-sm">{label}</p>
	<p class="text-2xl font-bold mt-1 {valueClass}">{value}</p>
	{#if sub}
		<p class="text-text-muted text-xs mt-1">{sub}</p>
	{/if}
</div>

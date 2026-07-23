<!-- Modal overlay component -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onclose: () => void;
		title?: string;
		children: Snippet;
		wide?: boolean;
		fit?: boolean;
	}

	let { open, onclose, title, children, wide = false, fit = false }: Props = $props();
</script>

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 landscape:p-1"
		onpointerdown={(e) => { if (e.target === e.currentTarget) onclose(); }}
	>
		<div class="bg-surface-light rounded-2xl shadow-2xl flex flex-col overflow-hidden {wide ? 'w-[min(96vw,56rem)] max-h-[94dvh]' : fit ? 'w-[min(96vw,56rem)] landscape:w-[min(96vw,64rem)] h-[min(96dvh,52rem)]' : 'w-[min(96vw,34rem)] max-h-[92dvh]'}">
			{#if title}
				<div class="flex items-center justify-between border-b border-surface-lighter {fit ? 'px-4 py-2 sm:px-5 sm:py-3 landscape:px-3 landscape:py-1.5' : 'px-4 py-3 sm:px-6'} shrink-0">
					<h2 class="{fit ? 'text-base sm:text-xl' : 'text-lg sm:text-xl'} font-bold">{title}</h2>
					<button
						type="button"
						class="text-text-muted hover:text-text text-2xl leading-none min-h-10 min-w-10"
						onclick={onclose}
					>
						✕
					</button>
				</div>
			{/if}
			<div class="{fit ? 'flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 landscape:p-2 flex flex-col' : 'flex-1 min-h-0 overflow-y-auto p-4 sm:p-6'}">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

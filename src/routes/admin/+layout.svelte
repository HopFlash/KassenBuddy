<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { getSettings } from '$lib/db';
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();

	let authenticated = $state(false);
	let pinInput = $state('');
	let error = $state('');
	let correctPin = $state('1234');

	onMount(async () => {
		const stored = sessionStorage.getItem('admin-auth');
		if (stored === 'true') {
			authenticated = true;
			return;
		}
		const settings = await getSettings();
		correctPin = settings.adminPin;
	});

	function checkPin() {
		if (pinInput === correctPin) {
			authenticated = true;
			sessionStorage.setItem('admin-auth', 'true');
			error = '';
		} else {
			error = 'Falscher PIN';
			pinInput = '';
		}
	}

	function pressDigit(d: string) {
		if (pinInput.length < 6) {
			pinInput += d;
		}
	}

	function backspace() {
		pinInput = pinInput.slice(0, -1);
		error = '';
	}
</script>

{#if authenticated}
	<div class="flex h-full">
		<!-- Sidebar -->
		<nav class="w-56 bg-surface-light border-r border-surface-lighter flex flex-col p-4 shrink-0">
			<h2 class="text-xl font-bold mb-6">⚙️ Admin</h2>
			<div class="flex flex-col gap-2 flex-1">
				<a
					href="{base}/admin"
					class="px-4 py-3 rounded-xl hover:bg-surface-lighter transition-colors text-sm font-semibold"
				>
					📊 Übersicht
				</a>
				<a
					href="{base}/admin/products"
					class="px-4 py-3 rounded-xl hover:bg-surface-lighter transition-colors text-sm font-semibold"
				>
					📦 Produkte
				</a>
				<a
					href="{base}/admin/statistics"
					class="px-4 py-3 rounded-xl hover:bg-surface-lighter transition-colors text-sm font-semibold"
				>
					📈 Statistik
				</a>
				<a
					href="{base}/admin/settings"
					class="px-4 py-3 rounded-xl hover:bg-surface-lighter transition-colors text-sm font-semibold"
				>
					🔧 Einstellungen
				</a>
			</div>
			<a
				href="{base}/"
				class="px-4 py-3 rounded-xl bg-surface-lighter hover:bg-accent/20 transition-colors text-sm font-semibold text-center"
			>
				← Zurück zu KassenBuddy
			</a>
		</nav>

		<!-- Content -->
		<div class="flex-1 overflow-y-auto p-6">
			{@render children()}
		</div>
	</div>
{:else}
	<!-- PIN Entry Screen -->
	<div class="flex items-center justify-center h-full">
		<div class="bg-surface-light rounded-2xl p-8 w-80">
			<h2 class="text-xl font-bold text-center mb-6">🔒 Admin-Zugang</h2>

			<!-- PIN dots -->
			<div class="flex justify-center gap-3 mb-4">
				{#each { length: 4 } as _, i}
					<div class="w-4 h-4 rounded-full {i < pinInput.length ? 'bg-accent' : 'bg-surface-lighter'}"></div>
				{/each}
			</div>

			{#if error}
				<p class="text-danger text-sm text-center mb-4">{error}</p>
			{/if}

			<!-- Number pad -->
			<div class="grid grid-cols-3 gap-2">
				{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as key}
					{#if key === ''}
						<div></div>
					{:else}
						<button
							type="button"
							class="bg-surface-lighter hover:bg-surface-lighter/80 active:bg-accent rounded-xl py-4 text-xl font-semibold transition-colors"
							onclick={() => key === '⌫' ? backspace() : pressDigit(key)}
						>
							{key}
						</button>
					{/if}
				{/each}
			</div>

			<button
				type="button"
				class="w-full mt-4 bg-accent hover:bg-accent-hover text-white rounded-xl py-3 font-bold transition-colors disabled:opacity-40"
				disabled={pinInput.length < 4}
				onclick={checkPin}
			>
				Entsperren
			</button>

			<a
				href="{base}/"
				class="block text-center text-text-muted text-sm mt-4 hover:text-text transition-colors"
			>
				← Zurück zu KassenBuddy
			</a>
		</div>
	</div>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllKassentage, getAllTransactions, updateKassentagTimes } from '$lib/db';
	import type { Kassentag, Transaction } from '$lib/types';
	import { formatDate, formatCurrency } from '$lib/utils/currency';
	import Modal from '$lib/components/shared/Modal.svelte';

	let kassentage = $state<Kassentag[]>([]);
	let transactions = $state<Transaction[]>([]);
	let loadError = $state('');
	let loading = $state(false);

	const statsByKassentag = $derived.by(() => {
		const map = new Map<string, { count: number; revenue: number }>();
		for (const tx of transactions) {
			if (!tx.kassentagId) continue;
			const entry = map.get(tx.kassentagId) ?? { count: 0, revenue: 0 };
			entry.count += 1;
			entry.revenue += tx.total;
			map.set(tx.kassentagId, entry);
		}
		return map;
	});

	function durationLabel(k: Kassentag): string {
		const end = k.endedAt ?? Date.now();
		const minutes = Math.max(0, Math.round((end - k.startedAt) / 60000));
		const hours = Math.floor(minutes / 60);
		return `${hours}h ${minutes % 60}min`;
	}

	async function load() {
		loading = true;
		loadError = '';
		try {
			[kassentage, transactions] = await Promise.all([
				getAllKassentage(),
				getAllTransactions()
			]);
		} catch (error) {
			loadError =
				error instanceof Error ? error.message : 'Kassentage konnten nicht geladen werden';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
	});

	let editOpen = $state(false);
	let editId = $state('');
	let editStart = $state('');
	let editEnd = $state('');
	let editIsOpenEnd = $state(false);
	let editError = $state('');
	let editSaving = $state(false);

	function toLocalInputValue(timestamp: number): string {
		if (!Number.isFinite(timestamp)) return '';
		const date = new Date(timestamp);
		date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
		return date.toISOString().slice(0, 16);
	}

	function openEdit(k: Kassentag) {
		editId = k.id;
		editStart = toLocalInputValue(k.startedAt);
		editIsOpenEnd = k.endedAt === null;
		editEnd = k.endedAt !== null ? toLocalInputValue(k.endedAt) : '';
		editError = '';
		editOpen = true;
	}

	async function saveEdit() {
		editError = '';
		const startedAt = new Date(editStart).getTime();
		const endedAt = editIsOpenEnd ? null : new Date(editEnd).getTime();

		if (!Number.isFinite(startedAt) || (endedAt !== null && !Number.isFinite(endedAt))) {
			editError = 'Bitte gültige Start- und Endzeiten eingeben';
			return;
		}
		if (endedAt !== null && startedAt >= endedAt) {
			editError = 'Startzeit muss vor der Endzeit liegen';
			return;
		}

		editSaving = true;
		try {
			await updateKassentagTimes(editId, startedAt, endedAt);
			editOpen = false;
			await load();
		} catch (error) {
			editError = error instanceof Error ? error.message : 'Speichern fehlgeschlagen';
		} finally {
			editSaving = false;
		}
	}
</script>

<h1 class="text-2xl font-bold mb-6">Kassentage</h1>

<div class="bg-surface-light rounded-xl p-4 sm:p-6">
	{#if loadError}
		<div role="alert" class="text-danger text-sm">
			<p>Kassentage konnten nicht geladen werden: {loadError}</p>
			<button
				type="button"
				class="mt-3 px-4 py-2 rounded-lg bg-surface-lighter hover:bg-surface-lighter/80 font-semibold"
				onclick={load}
				disabled={loading}
			>
				{loading ? 'Lädt…' : 'Erneut laden'}
			</button>
		</div>
	{:else if loading}
		<p class="text-sm text-text-muted">Kassentage werden geladen…</p>
	{:else}
		<div class="space-y-2">
			{#each kassentage as k (k.id)}
				{@const stats = statsByKassentag.get(k.id) ?? { count: 0, revenue: 0 }}
				<div
					class="bg-surface-lighter rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4"
				>
					<div class="flex-1 min-w-0">
						<p class="font-semibold text-sm">
							{formatDate(k.startedAt)} – {k.endedAt === null ? 'läuft noch' : formatDate(k.endedAt)}
							{#if k.status === 'open'}
								<span class="text-success">🟢</span>
							{/if}
						</p>
						<p class="text-xs text-text-muted">
							Dauer: {durationLabel(k)} · {stats.count}
							{stats.count === 1 ? 'Transaktion' : 'Transaktionen'} · {formatCurrency(stats.revenue)}
							{#if k.source === 'legacy'}
								<span class="ml-1 text-text-muted">(migriert)</span>
							{/if}
						</p>
					</div>
					<button
						type="button"
						class="px-3 py-2 rounded-lg bg-surface hover:bg-accent/20 text-sm font-semibold transition-colors self-start sm:self-auto"
						onclick={() => openEdit(k)}
					>
						Bearbeiten
					</button>
				</div>
			{:else}
				<p class="text-sm text-text-muted">Noch keine Kassentage vorhanden</p>
			{/each}
		</div>
	{/if}
</div>

<Modal open={editOpen} onclose={() => (editOpen = false)} title="Kassentag bearbeiten">
	<div class="space-y-4">
		<div>
			<label class="block text-sm text-text-muted mb-1" for="edit-start">Start</label>
			<input
				id="edit-start"
				type="datetime-local"
				class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent w-full"
				bind:value={editStart}
			/>
		</div>

		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={editIsOpenEnd} />
			Läuft noch (kein Ende)
		</label>

		{#if !editIsOpenEnd}
			<div>
				<label class="block text-sm text-text-muted mb-1" for="edit-end">Ende</label>
				<input
					id="edit-end"
					type="datetime-local"
					class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent w-full"
					bind:value={editEnd}
				/>
			</div>
		{/if}

		{#if editError}
			<p role="alert" class="text-danger text-sm">{editError}</p>
		{/if}

		<div class="flex justify-end gap-3">
			<button
				type="button"
				class="bg-surface-lighter hover:bg-surface-lighter/80 text-text-muted rounded-lg px-6 py-2 font-semibold transition-colors"
				onclick={() => (editOpen = false)}
				disabled={editSaving}
			>
				Abbrechen
			</button>
			<button
				type="button"
				class="bg-accent hover:bg-accent-hover text-white rounded-lg px-6 py-2 font-semibold transition-colors disabled:opacity-50"
				onclick={saveEdit}
				disabled={editSaving}
			>
				{editSaving ? 'Speichern…' : 'Speichern'}
			</button>
		</div>
	</div>
</Modal>

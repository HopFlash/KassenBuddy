<script lang="ts">
	import { onMount } from 'svelte';
	import { addCategory, deleteCategory, getCategories, renameCategory } from '$lib/db';

	let categories = $state<string[]>([]);
	let newCategory = $state('');
	let editOriginal = $state<string | null>(null);
	let editValue = $state('');
	let confirmDelete = $state<string | null>(null);
	let error = $state('');
	let success = $state('');

	onMount(loadCategories);

	async function loadCategories() {
		categories = await getCategories();
	}

	function clearStatus() {
		error = '';
		success = '';
	}

	async function handleAdd() {
		clearStatus();
		try {
			await addCategory(newCategory);
			newCategory = '';
			success = 'Kategorie angelegt';
			await loadCategories();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Kategorie konnte nicht angelegt werden';
		}
	}

	function startRename(category: string) {
		clearStatus();
		editOriginal = category;
		editValue = category;
	}

	function cancelRename() {
		editOriginal = null;
		editValue = '';
	}

	async function applyRename() {
		if (!editOriginal) return;
		clearStatus();
		try {
			await renameCategory(editOriginal, editValue);
			success = 'Kategorie umbenannt';
			cancelRename();
			await loadCategories();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Kategorie konnte nicht umbenannt werden';
		}
	}

	async function handleDelete(category: string) {
		clearStatus();
		if (confirmDelete !== category) {
			confirmDelete = category;
			return;
		}
		try {
			await deleteCategory(category);
			success = `Kategorie gelöscht, Produkte zu „Sonstiges“ verschoben`;
			confirmDelete = null;
			await loadCategories();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Kategorie konnte nicht gelöscht werden';
		}
	}
</script>

<h1 class="text-2xl font-bold mb-6">Kategorien</h1>

<div class="bg-surface-light rounded-xl p-4 sm:p-6 mb-6">
	<h2 class="font-bold mb-3">Neue Kategorie</h2>
	<div class="flex flex-col sm:flex-row gap-3">
		<input
			type="text"
			class="flex-1 bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
			bind:value={newCategory}
			placeholder="z. B. Longdrinks"
		/>
		<button
			type="button"
			class="bg-accent hover:bg-accent-hover text-white rounded-xl min-h-11 px-6 py-3 font-semibold transition-colors"
			onclick={handleAdd}
		>
			Anlegen
		</button>
	</div>
</div>

{#if error}
	<p class="text-danger text-sm mb-4">{error}</p>
{/if}
{#if success}
	<p class="text-success text-sm mb-4">{success}</p>
{/if}

<div class="bg-surface-light rounded-xl p-4 sm:p-6">
	<h2 class="font-bold mb-4">Vorhandene Kategorien</h2>
	<div class="space-y-2">
		{#each categories as category}
			<div class="bg-surface-lighter rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
				{#if editOriginal === category}
					<input
						type="text"
						class="flex-1 bg-surface rounded-lg px-3 py-2 text-text outline-none focus:ring-2 focus:ring-accent"
						bind:value={editValue}
					/>
					<div class="flex gap-2">
						<button
							type="button"
							class="bg-success hover:bg-success/80 text-white rounded-lg min-h-10 px-4 py-2 text-sm font-semibold transition-colors"
							onclick={applyRename}
						>
							Speichern
						</button>
						<button
							type="button"
							class="bg-surface rounded-lg min-h-10 px-4 py-2 text-sm font-semibold text-text-muted hover:text-text transition-colors"
							onclick={cancelRename}
						>
							Abbrechen
						</button>
					</div>
				{:else}
					<p class="flex-1 font-semibold">{category}</p>
					<div class="flex gap-2">
						<button
							type="button"
							class="px-3 py-2 rounded-lg bg-surface hover:bg-accent/20 text-sm font-semibold transition-colors"
							onclick={() => startRename(category)}
						>
							Umbenennen
						</button>
						{#if category === 'Sonstiges'}
							<button
								type="button"
								class="px-3 py-2 rounded-lg bg-surface text-text-muted text-sm font-semibold opacity-60 cursor-not-allowed"
								disabled
							>
								Nicht löschbar
							</button>
						{:else}
							<button
								type="button"
								class="px-3 py-2 rounded-lg text-sm font-semibold transition-colors {confirmDelete === category ? 'bg-danger text-white' : 'bg-surface hover:bg-danger/20 text-danger'}"
								onclick={() => handleDelete(category)}
							>
								{confirmDelete === category ? 'Wirklich löschen?' : 'Löschen'}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-text-muted">Keine Kategorien vorhanden</p>
		{/each}
	</div>
</div>

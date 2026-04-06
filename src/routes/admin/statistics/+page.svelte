<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllTransactions, getTransactionsByDateRange, deleteAllTransactions, saveTransaction, deleteTransaction, getSettings } from '$lib/db';
	import { formatCurrency, formatDate, formatDateShort, startOfDay, endOfDay } from '$lib/utils/currency';
	import { exportTransactionsToXlsx, exportProductSummaryToXlsx, exportTransactionsToJson, parseTransactionsJson } from '$lib/utils/export';
	import type { Transaction, TransactionItem } from '$lib/types';
	import { generateId } from '$lib/utils/id';
	import StatCard from '$lib/components/shared/StatCard.svelte';

	let transactions = $state<Transaction[]>([]);
	let shopName = $state('KassenBuddy');
	let dateFrom = $state(new Date().toISOString().slice(0, 10));
	let dateTo = $state(new Date().toISOString().slice(0, 10));
	let filterActive = $state(false);
	let confirmClear = $state(false);

	const totalRevenue = $derived(transactions.reduce((sum, tx) => sum + tx.total, 0));
	const cashRevenue = $derived(transactions.filter((tx) => (tx.paymentMethod ?? 'cash') === 'cash').reduce((sum, tx) => sum + tx.total, 0));
	const cardRevenue = $derived(transactions.filter((tx) => tx.paymentMethod === 'card').reduce((sum, tx) => sum + tx.total, 0));

	// Product breakdown
	const productBreakdown = $derived.by(() => {
		const map = new Map<string, { name: string; quantity: number; revenue: number }>();
		for (const tx of transactions) {
			for (const item of tx.items) {
				const existing = map.get(item.productId) ?? { name: item.productName, quantity: 0, revenue: 0 };
				existing.quantity += item.quantity;
				existing.revenue += item.subtotal;
				map.set(item.productId, existing);
			}
		}
		return [...map.values()].sort((a, b) => b.revenue - a.revenue);
	});

	onMount(async () => {
		const settings = await getSettings();
		shopName = settings.shopName;
		await loadAll();
	});

	async function loadAll() {
		filterActive = false;
		transactions = await getAllTransactions();
	}

	async function applyFilter() {
		const from = startOfDay(new Date(dateFrom));
		const to = endOfDay(new Date(dateTo));
		transactions = await getTransactionsByDateRange(from, to);
		filterActive = true;
	}

	function handleExport() {
		exportTransactionsToXlsx(transactions, shopName);
	}

	function handleProductExport() {
		exportProductSummaryToXlsx(transactions, shopName);
	}

	async function handleClearAll() {
		if (confirmClear) {
			await deleteAllTransactions();
			transactions = [];
			confirmClear = false;
		} else {
			confirmClear = true;
			setTimeout(() => (confirmClear = false), 4000);
		}
	}

	let importStatus = $state<{ type: 'success' | 'error'; msg: string } | null>(null);
	let deletingTxId = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	function handleJsonExport() {
		exportTransactionsToJson(transactions, shopName);
	}

	async function handleJsonImport(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		(e.target as HTMLInputElement).value = '';
		try {
			const txs = await parseTransactionsJson(file);
			const existingIds = new Set(transactions.map((t) => t.id));
			let added = 0;
			let updated = 0;
			for (const tx of txs) {
				if (existingIds.has(tx.id)) updated++;
				else added++;
				await saveTransaction(tx);
			}
			await loadAll();
			importStatus = { type: 'success', msg: `${added} importiert, ${updated} aktualisiert.` };
			setTimeout(() => (importStatus = null), 5000);
		} catch (err) {
			importStatus = {
				type: 'error',
				msg: err instanceof Error ? err.message : 'Import fehlgeschlagen'
			};
			setTimeout(() => (importStatus = null), 5000);
		}
	}

	async function handleDeleteTransaction(id: string) {
		await deleteTransaction(id);
		transactions = transactions.filter((tx) => tx.id !== id);
		if (deletingTxId === id) deletingTxId = null;
	}

	async function reloadCurrent() {
		if (filterActive) {
			const from = startOfDay(new Date(dateFrom));
			const to = endOfDay(new Date(dateTo));
			transactions = await getTransactionsByDateRange(from, to);
		} else {
			await loadAll();
		}
	}

	// --- Transaction edit / create modal ---
	interface EditItem {
		productId: string;
		productName: string;
		price: number;
		quantity: number;
	}

	let editModalOpen = $state(false);
	let editIsNew = $state(false);
	let editTxId = $state('');
	let editTimestamp = $state('');
	let editItems = $state<EditItem[]>([]);
	let editAmountPaid = $state(0);
	let editPaymentMethod = $state<'cash' | 'card'>('cash');
	let editSaving = $state(false);

	const editTotal = $derived(
		Math.round(editItems.reduce((s, i) => s + i.price * i.quantity, 0) * 100) / 100
	);
	const editChange = $derived(Math.round(Math.max(editAmountPaid - editTotal, 0) * 100) / 100);
	const editValid = $derived(
		editItems.length > 0 &&
			editItems.every((i) => i.productName.trim().length > 0 && i.price >= 0 && i.quantity > 0) &&
			editTimestamp.length > 0
	);

	function openNewTransaction() {
		editIsNew = true;
		editTxId = generateId();
		editTimestamp = new Date().toISOString().slice(0, 16);
		editItems = [{ productId: generateId(), productName: '', price: 0, quantity: 1 }];
		editAmountPaid = 0;
		editPaymentMethod = 'cash';
		editModalOpen = true;
	}

	function openEditTransaction(tx: Transaction) {
		editIsNew = false;
		editTxId = tx.id;
		editTimestamp = new Date(tx.timestamp).toISOString().slice(0, 16);
		editItems = tx.items.map((i) => ({
			productId: i.productId,
			productName: i.productName,
			price: i.price,
			quantity: i.quantity
		}));
		editAmountPaid = tx.amountPaid;
		editPaymentMethod = tx.paymentMethod ?? 'cash';
		editModalOpen = true;
	}

	function addEditItem() {
		editItems = [...editItems, { productId: generateId(), productName: '', price: 0, quantity: 1 }];
	}

	function removeEditItem(idx: number) {
		editItems = editItems.filter((_, i) => i !== idx);
	}

	async function saveEditTransaction() {
		if (!editValid || editSaving) return;
		editSaving = true;
		try {
			const items: TransactionItem[] = editItems.map((i) => ({
				productId: i.productId,
				productName: i.productName.trim(),
				price: i.price,
				quantity: i.quantity,
				subtotal: Math.round(i.price * i.quantity * 100) / 100
			}));
			const tx: Transaction = {
				id: editTxId,
				timestamp: new Date(editTimestamp).getTime(),
				items,
				total: editTotal,
				amountPaid: editAmountPaid,
				change: editChange,
				paymentMethod: editPaymentMethod
			};
			await saveTransaction(tx);
			await reloadCurrent();
			editModalOpen = false;
		} finally {
			editSaving = false;
		}
	}
</script>

<div class="flex items-center justify-between mb-6">
	<h1 class="text-2xl font-bold">Statistik & Export</h1>
	<div class="flex gap-2 flex-wrap items-start">
		<!-- hidden file input for JSON import -->
		<input
			type="file"
			accept=".json"
			class="hidden"
			bind:this={fileInput}
			onchange={handleJsonImport}
		/>

		<!-- JSON buttons -->
		<button
			type="button"
			class="bg-surface-lighter hover:bg-surface-lighter/80 text-text rounded-xl px-5 py-3 font-semibold transition-colors flex items-center gap-2"
			onclick={handleJsonExport}
			disabled={transactions.length === 0}
		>
			<span class="text-base">📤</span>
			<span class="flex flex-col items-start leading-tight">
				<span class="text-[11px] text-text-muted font-normal">JSON-Export</span>
				<span>{filterActive ? 'Gefiltert' : 'Alle'}</span>
			</span>
		</button>
		<button
			type="button"
			class="bg-surface-lighter hover:bg-surface-lighter/80 text-text rounded-xl px-5 py-3 font-semibold transition-colors flex items-center gap-2"
			onclick={() => fileInput.click()}
		>
			<span class="text-base">📥</span>
			<span class="flex flex-col items-start leading-tight">
				<span class="text-[11px] text-text-muted font-normal">JSON-Import</span>
				<span>Zusammenführen</span>
			</span>
		</button>

		<!-- divider -->
		<div class="w-px bg-surface-lighter self-stretch mx-1"></div>

		<!-- Excel buttons -->
		<button
			type="button"
			class="bg-surface-lighter hover:bg-surface-lighter/80 text-text rounded-xl px-5 py-3 font-semibold transition-colors flex items-center gap-2"
			onclick={handleProductExport}
			disabled={transactions.length === 0}
		>
			<span class="text-base">📦</span>
			<span class="flex flex-col items-start leading-tight">
				<span class="text-[11px] text-text-muted font-normal">Excel-Download</span>
				<span>Produktübersicht</span>
			</span>
		</button>
		<button
			type="button"
			class="bg-success hover:bg-success/80 text-white rounded-xl px-5 py-3 font-semibold transition-colors flex items-center gap-2"
			onclick={handleExport}
			disabled={transactions.length === 0}
		>
			<span class="text-base">📊</span>
			<span class="flex flex-col items-start leading-tight">
				<span class="text-[11px] font-normal opacity-80">Excel-Download</span>
				<span>Transaktionen</span>
			</span>
		</button>
	</div>
</div>

{#if importStatus}
	<div
		class="mb-4 rounded-xl px-4 py-3 text-sm font-semibold {importStatus.type === 'success'
			? 'bg-success/20 text-success'
			: 'bg-danger/20 text-danger'}"
	>
		{importStatus.msg}
	</div>
{/if}

<!-- Filter -->
<div class="bg-surface-light rounded-xl p-4 mb-6 flex items-end gap-4 flex-wrap">
	<div>
		<label for="from" class="block text-sm text-text-muted mb-1">Von</label>
		<input
			id="from"
			type="date"
			class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent"
			bind:value={dateFrom}
		/>
	</div>
	<div>
		<label for="to" class="block text-sm text-text-muted mb-1">Bis</label>
		<input
			id="to"
			type="date"
			class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent"
			bind:value={dateTo}
		/>
	</div>
	<button
		type="button"
		class="bg-accent hover:bg-accent-hover text-white rounded-lg px-6 py-2 font-semibold transition-colors"
		onclick={applyFilter}
	>
		Filtern
	</button>
	{#if filterActive}
		<button
			type="button"
			class="bg-surface-lighter hover:bg-surface-lighter/80 rounded-lg px-6 py-2 font-semibold transition-colors text-text-muted"
			onclick={loadAll}
		>
			Filter zurücksetzen
		</button>
	{/if}
</div>

<!-- Summary cards -->
<div class="grid grid-cols-3 gap-4 mb-4">
	<StatCard pad="sm" label="Transaktionen" value={transactions.length} />
	<StatCard pad="sm" label="Gesamtumsatz" value={formatCurrency(totalRevenue)} valueClass="text-success" />
	<StatCard pad="sm" label="Ø pro Transaktion" value={transactions.length > 0 ? formatCurrency(totalRevenue / transactions.length) : '–'} />
</div>
<div class="grid grid-cols-2 gap-4 mb-6">
	<StatCard pad="sm" label="💵 Barzahlung" value={formatCurrency(cashRevenue)} />
	<StatCard pad="sm" label="💳 Kartenzahlung" value={formatCurrency(cardRevenue)} />
</div>

<!-- Product breakdown -->
{#if productBreakdown.length > 0}
	<div class="bg-surface-light rounded-xl p-4 mb-6">
		<h2 class="font-bold mb-3">Produkt-Auswertung</h2>
		<div class="space-y-2">
			{#each productBreakdown as p}
				{@const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0}
				<div class="flex items-center gap-3">
					<span class="w-40 truncate text-sm font-semibold">{p.name}</span>
					<div class="flex-1 bg-surface-lighter rounded-full h-3 overflow-hidden">
						<div class="bg-accent h-full rounded-full transition-all" style="width: {pct}%"></div>
					</div>
					<span class="text-sm text-text-muted w-12 text-right">{p.quantity}×</span>
					<span class="text-sm font-bold w-24 text-right">{formatCurrency(p.revenue)}</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<!-- Transaction list -->
<div class="bg-surface-light rounded-xl p-4 mb-6">
	<div class="flex items-center justify-between mb-3">
		<h2 class="font-bold">Letzte Transaktionen</h2>
		<div class="flex items-center gap-3">
			<button
				type="button"
				class="text-sm font-semibold text-accent hover:text-accent/80 transition-colors"
				onclick={openNewTransaction}
			>
				+ Neue Transaktion
			</button>
			{#if transactions.length > 0}
				<button
					type="button"
					class="text-sm font-semibold transition-colors {confirmClear ? 'bg-danger text-white px-4 py-1 rounded-lg' : 'text-danger hover:text-danger/80'}"
					onclick={handleClearAll}
				>
					{confirmClear ? 'Wirklich alle löschen?' : 'Alle löschen'}
				</button>
			{/if}
		</div>
	</div>

	<div class="space-y-2 max-h-96 overflow-y-auto">
		{#each transactions as tx (tx.id)}
			<div class="bg-surface-lighter rounded-lg p-3">
				<div class="flex justify-between items-center mb-1">
					<span class="text-sm text-text-muted">{formatDate(tx.timestamp)}</span>
					<div class="flex items-center gap-2">
						<span class="text-xs px-2 py-0.5 rounded-full font-semibold {(tx.paymentMethod ?? 'cash') === 'card' ? 'bg-accent/20 text-accent' : 'bg-surface-light text-text-muted'}">{(tx.paymentMethod ?? 'cash') === 'card' ? '💳 Karte' : '💵 Bar'}</span>
						<span class="font-bold text-success">{formatCurrency(tx.total)}</span>
						{#if deletingTxId === tx.id}
							<button
								type="button"
								class="text-xs text-danger font-bold hover:underline"
								onclick={() => handleDeleteTransaction(tx.id)}
							>Löschen?</button>
							<button
								type="button"
								class="text-xs text-text-muted hover:text-text"
								onclick={() => (deletingTxId = null)}
							>Abbrechen</button>
						{:else}
							<button
								type="button"
								class="text-text-muted hover:text-accent transition-colors text-sm leading-none"
								onclick={() => openEditTransaction(tx)}
								aria-label="Transaktion bearbeiten"
							>✎</button>
							<button
								type="button"
								class="text-text-muted hover:text-danger transition-colors text-sm leading-none"
								onclick={() => (deletingTxId = tx.id)}
								aria-label="Transaktion löschen"
							>✕</button>
						{/if}
					</div>
				</div>
				<p class="text-xs text-text-muted">
					{tx.items.map((i) => `${i.quantity}× ${i.productName}`).join(', ')}
				</p>
			</div>
		{/each}
		{#if transactions.length === 0}
			<p class="text-center text-text-muted py-6">Keine Transaktionen vorhanden</p>
		{/if}
	</div>
</div>

<!-- Transaction edit / create modal -->
{#if editModalOpen}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
		role="dialog"
		aria-modal="true"
		aria-label="Transaktion bearbeiten"
	>
		<div class="bg-surface-light rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto p-6">
			<h2 class="text-lg font-bold mb-4">{editIsNew ? 'Neue Transaktion' : 'Transaktion bearbeiten'}</h2>

			<!-- Timestamp -->
			<div class="mb-4">
				<label class="block text-sm text-text-muted mb-1" for="edit-ts">Datum & Uhrzeit</label>
				<input
					id="edit-ts"
					type="datetime-local"
					class="bg-surface-lighter rounded-lg px-4 py-2 text-text outline-none focus:ring-2 focus:ring-accent w-full"
					bind:value={editTimestamp}
				/>
			</div>

			<!-- Items -->
			<div class="mb-4">
				<div class="flex items-center justify-between mb-2">
					<span class="text-sm text-text-muted font-semibold">Artikel</span>
					<button
						type="button"
						class="text-accent hover:text-accent/80 text-sm font-semibold"
						onclick={addEditItem}
					>+ Artikel hinzufügen</button>
				</div>

				<!-- Header row -->
				<div class="hidden sm:grid grid-cols-[1fr_5rem_4rem_5rem_1.5rem] gap-2 px-3 mb-1">
					<span class="text-xs text-text-muted">Produkt</span>
					<span class="text-xs text-text-muted">Preis</span>
					<span class="text-xs text-text-muted">Menge</span>
					<span class="text-xs text-text-muted text-right">Summe</span>
				</div>

				<div class="space-y-2">
					{#each editItems as item, i}
						<div class="bg-surface-lighter rounded-lg px-3 py-2 grid grid-cols-[1fr_5rem_4rem_5rem_1.5rem] items-center gap-2">
							<input
								type="text"
								placeholder="Produktname"
								class="bg-surface rounded px-2 py-1 text-sm text-text outline-none focus:ring-1 focus:ring-accent min-w-0"
								bind:value={item.productName}
							/>
							<input
								type="number"
								placeholder="0,00"
								min="0"
								step="0.01"
								class="bg-surface rounded px-2 py-1 text-sm text-text outline-none focus:ring-1 focus:ring-accent w-full"
								bind:value={item.price}
							/>
							<input
								type="number"
								placeholder="1"
								min="1"
								step="1"
								class="bg-surface rounded px-2 py-1 text-sm text-text outline-none focus:ring-1 focus:ring-accent w-full"
								bind:value={item.quantity}
							/>
							<span class="text-sm font-semibold text-right">
								{formatCurrency(Math.round(item.price * item.quantity * 100) / 100)}
							</span>
							<button
								type="button"
								class="text-text-muted hover:text-danger transition-colors leading-none disabled:opacity-30"
								onclick={() => removeEditItem(i)}
								disabled={editItems.length <= 1}
							>✕</button>
						</div>
					{/each}
				</div>
			</div>

			<!-- Totals -->
			<div class="bg-surface-lighter rounded-lg px-4 py-3 mb-5 space-y-2">
				<div class="flex justify-between items-center">
					<span class="text-sm text-text-muted">Gesamt</span>
					<span class="font-bold text-success">{formatCurrency(editTotal)}</span>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-sm text-text-muted">Zahlungsart</span>
					<div class="flex gap-2">
						<button type="button" class="px-3 py-1 rounded-lg text-sm font-semibold transition-colors {editPaymentMethod === 'cash' ? 'bg-accent text-white' : 'bg-surface text-text-muted'}" onclick={() => { editPaymentMethod = 'cash'; }}>💵 Bar</button>
						<button type="button" class="px-3 py-1 rounded-lg text-sm font-semibold transition-colors {editPaymentMethod === 'card' ? 'bg-accent text-white' : 'bg-surface text-text-muted'}" onclick={() => { editPaymentMethod = 'card'; }}>💳 Karte</button>
					</div>
				</div>
				<div class="flex justify-between items-center">
					<label class="text-sm text-text-muted" for="edit-paid">Bezahlt</label>
					<input
						id="edit-paid"
						type="number"
						min="0"
						step="0.01"
						class="w-28 bg-surface rounded px-2 py-1 text-sm text-right text-text outline-none focus:ring-1 focus:ring-accent"
						bind:value={editAmountPaid}
					/>
				</div>
				<div class="flex justify-between items-center">
					<span class="text-sm text-text-muted">Rückgeld</span>
					<span class="font-semibold">{formatCurrency(editChange)}</span>
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-3">
				<button
					type="button"
					class="bg-surface-lighter hover:bg-surface-lighter/80 text-text-muted rounded-lg px-6 py-2 font-semibold transition-colors"
					onclick={() => (editModalOpen = false)}
				>
					Abbrechen
				</button>
				<button
					type="button"
					class="bg-accent hover:bg-accent-hover text-white rounded-lg px-6 py-2 font-semibold transition-colors disabled:opacity-50"
					onclick={saveEditTransaction}
					disabled={!editValid || editSaving}
				>
					{editSaving ? 'Speichern…' : 'Speichern'}
				</button>
			</div>
		</div>
	</div>
{/if}

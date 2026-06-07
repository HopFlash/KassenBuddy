<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllTransactions, getActiveProducts, getTransactionsByDateRange } from '$lib/db';
	import { formatCurrency, startOfDay, endOfDay } from '$lib/utils/currency';
	import type { Transaction } from '$lib/types';
	import StatCard from '$lib/components/shared/StatCard.svelte';
	import HourlyRevenueChart from '$lib/components/shared/HourlyRevenueChart.svelte';

	let dayTx = $state<Transaction[]>([]);
	let dayRevenue = $state(0);
	let dayCount = $state(0);
	let totalRevenue = $state(0);
	let totalCount = $state(0);
	let productCount = $state(0);

	// Normalize to midnight local time (YYYY-MM-DD string → Date at 00:00:00 local)
	function localMidnight(d: Date): Date {
		return new Date(d.getFullYear(), d.getMonth(), d.getDate());
	}

	let selectedDay = $state(localMidnight(new Date()));

	const isToday = $derived(
		localMidnight(new Date()).getTime() === selectedDay.getTime()
	);

	const chartTitle = $derived.by(() => {
		if (isToday) return 'Umsatz pro Stunde — heute';
		return `Umsatz pro Stunde — ${selectedDay.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}`;
	});

	async function loadDay(day: Date) {
		const from = startOfDay(day);
		const to = endOfDay(day);
		dayTx = await getTransactionsByDateRange(from, to);
		dayCount = dayTx.length;
		dayRevenue = dayTx.reduce((sum, tx) => sum + tx.total, 0);
	}

	function prevDay() {
		const d = new Date(selectedDay);
		d.setDate(d.getDate() - 1);
		selectedDay = d;
		loadDay(d);
	}

	function nextDay() {
		if (isToday) return;
		const d = new Date(selectedDay);
		d.setDate(d.getDate() + 1);
		selectedDay = d;
		loadDay(d);
	}

	onMount(async () => {
		const [transactions, products] = await Promise.all([
			getAllTransactions(),
			getActiveProducts()
		]);

		productCount = products.length;
		totalCount = transactions.length;
		totalRevenue = transactions.reduce((sum, tx) => sum + tx.total, 0);

		await loadDay(selectedDay);
	});
</script>

<h1 class="text-2xl font-bold mb-6">Dashboard</h1>

<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
	<StatCard label="Umsatz heute" value={formatCurrency(dayRevenue)} valueClass="text-success" sub="{dayCount} Transaktionen" />
	<StatCard label="Umsatz gesamt" value={formatCurrency(totalRevenue)} valueClass="text-accent" sub="{totalCount} Transaktionen" />
	<StatCard label="Aktive Produkte" value={productCount} />
	<StatCard label="Ø pro Transaktion" value={totalCount > 0 ? formatCurrency(totalRevenue / totalCount) : '–'} />
</div>

<!-- Day navigation -->
<div class="flex items-center gap-3 mb-4">
	<button
		type="button"
		class="bg-surface-light hover:bg-surface-lighter rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
		onclick={prevDay}
	>
		← Vorheriger Tag
	</button>
	<span class="text-sm font-semibold text-text">
		{isToday ? 'Heute' : selectedDay.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
	</span>
	<button
		type="button"
		class="bg-surface-light hover:bg-surface-lighter rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
		onclick={nextDay}
		disabled={isToday}
	>
		Nächster Tag →
	</button>
</div>

<HourlyRevenueChart transactions={dayTx} title={chartTitle} />

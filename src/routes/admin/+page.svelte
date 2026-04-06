<script lang="ts">
	import { onMount } from 'svelte';
	import { getAllTransactions, getActiveProducts } from '$lib/db';
	import { formatCurrency, startOfDay, endOfDay } from '$lib/utils/currency';
	import type { Transaction } from '$lib/types';
	import StatCard from '$lib/components/shared/StatCard.svelte';
	import HourlyRevenueChart from '$lib/components/shared/HourlyRevenueChart.svelte';

	let todayTx = $state<Transaction[]>([]);
	let todayRevenue = $state(0);
	let todayCount = $state(0);
	let totalRevenue = $state(0);
	let totalCount = $state(0);
	let productCount = $state(0);

	onMount(async () => {
		const [transactions, products] = await Promise.all([
			getAllTransactions(),
			getActiveProducts()
		]);

		productCount = products.length;
		totalCount = transactions.length;
		totalRevenue = transactions.reduce((sum, tx) => sum + tx.total, 0);

		const todayStart = startOfDay(new Date());
		const todayEnd = endOfDay(new Date());
		todayTx = transactions.filter(
			(tx) => tx.timestamp >= todayStart && tx.timestamp <= todayEnd
		);
		todayCount = todayTx.length;
		todayRevenue = todayTx.reduce((sum, tx) => sum + tx.total, 0);
	});
</script>

<h1 class="text-2xl font-bold mb-6">Dashboard</h1>

<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
	<StatCard label="Umsatz heute" value={formatCurrency(todayRevenue)} valueClass="text-success" sub="{todayCount} Transaktionen" />
	<StatCard label="Umsatz gesamt" value={formatCurrency(totalRevenue)} valueClass="text-accent" sub="{totalCount} Transaktionen" />
	<StatCard label="Aktive Produkte" value={productCount} />
	<StatCard label="Ø pro Transaktion" value={totalCount > 0 ? formatCurrency(totalRevenue / totalCount) : '–'} />
</div>

<HourlyRevenueChart transactions={todayTx} />

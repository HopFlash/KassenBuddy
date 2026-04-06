import * as XLSX from 'xlsx';
import type { Transaction } from '$lib/types';
import { formatDate } from '$lib/utils/currency';

export function exportTransactionsToXlsx(transactions: Transaction[], shopName: string): void {
	const wb = XLSX.utils.book_new();

	// Sheet 1: All transactions
	const txRows = transactions.flatMap((tx) =>
		tx.items.map((item) => ({
			Datum: formatDate(tx.timestamp),
			'Transaktions-ID': tx.id.slice(0, 8),
			Zahlungsart: (tx.paymentMethod ?? 'cash') === 'card' ? 'Karte' : 'Bar',
			Produkt: item.productName,
			Einzelpreis: item.price,
			Menge: item.quantity,
			Zwischensumme: item.subtotal,
			Gesamt: tx.total,
			Bezahlt: tx.amountPaid,
			Rückgeld: tx.change
		}))
	);

	const txSheet = XLSX.utils.json_to_sheet(txRows);
	XLSX.utils.book_append_sheet(wb, txSheet, 'Transaktionen');

	// Sheet 2: Product summary
	const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();
	for (const tx of transactions) {
		for (const item of tx.items) {
			const existing = productMap.get(item.productId) ?? {
				name: item.productName,
				quantity: 0,
				revenue: 0
			};
			existing.quantity += item.quantity;
			existing.revenue += item.subtotal;
			productMap.set(item.productId, existing);
		}
	}

	const summaryRows = [...productMap.values()]
		.sort((a, b) => b.revenue - a.revenue)
		.map((p) => ({
			Produkt: p.name,
			'Anzahl verkauft': p.quantity,
			Umsatz: Math.round(p.revenue * 100) / 100
		}));

	const totalRevenue = summaryRows.reduce((sum, r) => sum + r.Umsatz, 0);
	summaryRows.push({
		Produkt: 'GESAMT',
		'Anzahl verkauft': summaryRows.reduce((sum, r) => sum + r['Anzahl verkauft'], 0),
		Umsatz: Math.round(totalRevenue * 100) / 100
	});

	const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
	XLSX.utils.book_append_sheet(wb, summarySheet, 'Produktübersicht');

	const dateStr = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(wb, `${shopName}_Verkäufe_${dateStr}.xlsx`);
}

export function exportProductSummaryToXlsx(transactions: Transaction[], shopName: string): void {
	const wb = XLSX.utils.book_new();

	// --- Sheet 1: Produktübersicht (sorted by quantity desc) ---
	const productMap = new Map<
		string,
		{ name: string; quantity: number; revenue: number; unitPrice: number }
	>();
	for (const tx of transactions) {
		for (const item of tx.items) {
			const existing = productMap.get(item.productId) ?? {
				name: item.productName,
				quantity: 0,
				revenue: 0,
				unitPrice: item.price
			};
			existing.quantity += item.quantity;
			existing.revenue = Math.round((existing.revenue + item.subtotal) * 100) / 100;
			productMap.set(item.productId, existing);
		}
	}

	const totalRevenue = [...productMap.values()].reduce((s, p) => s + p.revenue, 0);

	const summaryRows = [...productMap.values()]
		.sort((a, b) => b.quantity - a.quantity)
		.map((p) => ({
			Produkt: p.name,
			'Anzahl verkauft': p.quantity,
			Einzelpreis: p.unitPrice,
			Umsatz: Math.round(p.revenue * 100) / 100,
			'Anteil %': totalRevenue > 0 ? Math.round((p.revenue / totalRevenue) * 1000) / 10 : 0
		}));

	summaryRows.push({
		Produkt: 'GESAMT',
		'Anzahl verkauft': summaryRows.reduce((s, r) => s + r['Anzahl verkauft'], 0),
		Einzelpreis: 0,
		Umsatz: Math.round(totalRevenue * 100) / 100,
		'Anteil %': 100
	});

	XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Produkte');

	// --- Sheet 2: Tagesverlauf (products × dates matrix, quantities) ---
	const dateSet = new Set<string>();
	for (const tx of transactions) {
		dateSet.add(new Date(tx.timestamp).toISOString().slice(0, 10));
	}
	const dates = [...dateSet].sort();

	// productId → { name, dateKey → qty }
	const dailyMap = new Map<string, { name: string; byDate: Map<string, number> }>();
	for (const tx of transactions) {
		const dateKey = new Date(tx.timestamp).toISOString().slice(0, 10);
		for (const item of tx.items) {
			const row = dailyMap.get(item.productId) ?? {
				name: item.productName,
				byDate: new Map()
			};
			row.byDate.set(dateKey, (row.byDate.get(dateKey) ?? 0) + item.quantity);
			dailyMap.set(item.productId, row);
		}
	}

	const dailyTotalSort = [...dailyMap.values()].sort(
		(a, b) =>
			[...b.byDate.values()].reduce((s, v) => s + v, 0) -
			[...a.byDate.values()].reduce((s, v) => s + v, 0)
	);

	const dailyRows = dailyTotalSort.map((p) => {
		const row: Record<string, string | number> = { Produkt: p.name };
		for (const d of dates) row[d] = p.byDate.get(d) ?? 0;
		row['Gesamt'] = [...p.byDate.values()].reduce((s, v) => s + v, 0);
		return row;
	});

	if (dailyRows.length > 0) {
		XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyRows), 'Tagesverlauf');
	}

	const dateStr = new Date().toISOString().slice(0, 10);
	XLSX.writeFile(wb, `${shopName}_Produktübersicht_${dateStr}.xlsx`);
}

export function exportTransactionsToJson(transactions: Transaction[], shopName: string): void {
	const dateStr = new Date().toISOString().slice(0, 10);
	const json = JSON.stringify(transactions, null, 2);
	const blob = new Blob([json], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `${shopName}_Transaktionen_${dateStr}.json`;
	a.click();
	URL.revokeObjectURL(url);
}

export async function parseTransactionsJson(file: File): Promise<Transaction[]> {
	const text = await file.text();
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('Ungültige JSON-Datei');
	}
	if (!Array.isArray(data)) {
		throw new Error('JSON muss ein Array von Transaktionen sein');
	}
	for (const item of data) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof (item as Record<string, unknown>).id !== 'string' ||
			typeof (item as Record<string, unknown>).timestamp !== 'number' ||
			!Array.isArray((item as Record<string, unknown>).items)
		) {
			throw new Error('Ungültiges Format: Jeder Eintrag benötigt id, timestamp und items');
		}
	}
	return data as Transaction[];
}

export function formatCurrency(amount: number): string {
	return amount.toLocaleString('de-DE', {
		style: 'currency',
		currency: 'EUR'
	});
}

export function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

export function formatDateShort(timestamp: number): string {
	return new Date(timestamp).toLocaleDateString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
}

export function startOfDay(date: Date): number {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

export function endOfDay(date: Date): number {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d.getTime();
}

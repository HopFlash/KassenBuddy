import type { Kassentag } from '$lib/types';
import { formatDate } from './currency';

export function formatKassentagLabel(kassentag: Kassentag): string {
	const suffix = kassentag.status === 'open' ? ' Uhr · läuft noch' : ' Uhr';
	return `Kassentag ${formatDate(kassentag.startedAt)}${suffix}`;
}

export function formatKassentagRange(kassentag: Kassentag): string {
	const start = formatDate(kassentag.startedAt);
	const end = kassentag.endedAt === null ? 'läuft noch' : formatDate(kassentag.endedAt);
	return `${start} – ${end}`;
}

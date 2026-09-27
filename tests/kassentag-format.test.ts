import { describe, expect, it } from 'vitest';
import type { Kassentag } from '$lib/types';
import { formatKassentagLabel, formatKassentagRange } from '$lib/utils/kassentag';

const startedAt = new Date(2026, 8, 20, 20, 14).getTime();

function makeKassentag(endedAt: number | null, status: Kassentag['status']): Kassentag {
	return {
		id: 'test-kassentag',
		startedAt,
		endedAt,
		status,
		source: 'manual'
	};
}

describe('Kassentag display formatting', () => {
	it('formats the label for an open Kassentag', () => {
		expect(formatKassentagLabel(makeKassentag(null, 'open'))).toBe(
			'Kassentag 20.09.2026, 20:14 Uhr · läuft noch'
		);
	});

	it('formats the label for a closed Kassentag', () => {
		expect(formatKassentagLabel(makeKassentag(new Date(2026, 8, 21, 3, 40).getTime(), 'closed'))).toBe(
			'Kassentag 20.09.2026, 20:14 Uhr'
		);
	});

	it('formats the range for an open Kassentag', () => {
		expect(formatKassentagRange(makeKassentag(null, 'open'))).toBe(
			'20.09.2026, 20:14 – läuft noch'
		);
	});

	it('formats the range for a closed Kassentag', () => {
		expect(
			formatKassentagRange(
				makeKassentag(new Date(2026, 8, 21, 3, 40).getTime(), 'closed')
			)
		).toBe('20.09.2026, 20:14 – 21.09.2026, 03:40');
	});
});

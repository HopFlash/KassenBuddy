<script lang="ts">
	import type { Transaction } from '$lib/types';
	import { formatCurrency } from '$lib/utils/currency';

	interface Props {
		transactions: Transaction[];
	}

	let { transactions }: Props = $props();

	const currentHour = new Date().getHours();

	const PALETTE = [
		'#3b82f6', '#f59e0b', '#ec4899', '#22c55e',
		'#8b5cf6', '#f97316', '#06b6d4', '#84cc16',
		'#e11d48', '#0ea5e9',
	];

	interface Segment { name: string; revenue: number; color: string; }
	interface HourBucket { hour: number; total: number; count: number; segments: Segment[]; }

	// Stable color assignment per product name (alphabetically sorted → deterministic)
	const productColors = $derived.by(() => {
		const names = new Set<string>();
		for (const tx of transactions)
			for (const item of tx.items) names.add(item.productName);
		return new Map([...names].sort().map((name, i) => [name, PALETTE[i % PALETTE.length]]));
	});

	const hourlyData = $derived.by((): HourBucket[] => {
		const buckets: HourBucket[] = Array.from({ length: 24 }, (_, i) => ({
			hour: i, total: 0, count: 0, segments: []
		}));
		for (const tx of transactions) {
			const b = buckets[new Date(tx.timestamp).getHours()];
			b.count++;
			for (const item of tx.items) {
				b.total = Math.round((b.total + item.subtotal) * 100) / 100;
				const seg = b.segments.find(s => s.name === item.productName);
				if (seg) {
					seg.revenue = Math.round((seg.revenue + item.subtotal) * 100) / 100;
				} else {
					b.segments.push({
						name: item.productName,
						revenue: item.subtotal,
						color: productColors.get(item.productName) ?? '#94a3b8',
					});
				}
			}
		}
		// Largest segment at bottom of stack
		for (const b of buckets) b.segments.sort((a, x) => x.revenue - a.revenue);
		return buckets;
	});

	// Products present today → legend
	const activeProducts = $derived.by(() => {
		const seen = new Map<string, string>();
		for (const b of hourlyData)
			for (const s of b.segments)
				if (!seen.has(s.name)) seen.set(s.name, s.color);
		return [...seen.entries()]
			.sort((a, b) => a[0].localeCompare(b[0], 'de'))
			.map(([name, color]) => ({ name, color }));
	});

	const maxRevenue = $derived(Math.max(...hourlyData.map(b => b.total), 0.01));
	const hasData = $derived(hourlyData.some(b => b.total > 0));

	// SVG layout — padT can be small; tooltip is an HTML overlay, not SVG
	const W = 500;
	const H = 160;
	const padL = 48;
	const padR = 8;
	const padT = 10;
	const padB = 26;
	const chartW = W - padL - padR;
	const chartH = H - padT - padB;
	const slotW = chartW / 24;
	const barW = Math.max(slotW - 3, 2);
	const baselineY = padT + chartH;

	let hoveredHour = $state<number | null>(null);

	function bx(h: number) {
		return padL + h * slotW + (slotW - barW) / 2;
	}

	function totalBarH(rev: number) {
		return Math.max((rev / maxRevenue) * chartH, rev > 0 ? 2 : 0);
	}

	// Build stacked segment rects for one bucket (bottom → top)
	function buildStacks(bucket: HourBucket) {
		if (bucket.total === 0) return [];
		const barH = totalBarH(bucket.total);
		let y = baselineY;
		return bucket.segments.map(seg => {
			const h = Math.max((seg.revenue / bucket.total) * barH, 1);
			y -= h;
			return { color: seg.color, y, h };
		});
	}

	const guideValues = $derived(hasData ? [0.25, 0.5, 0.75, 1.0] : []);

	const hoveredBucket = $derived(hoveredHour !== null ? hourlyData[hoveredHour] : null);

	// CSS position for the HTML tooltip (percentage of SVG width → scales with responsive SVG)
	const tooltipStyle = $derived.by((): string => {
		if (hoveredHour === null) return 'display:none';
		const pct = ((padL + hoveredHour * slotW + slotW / 2) / W * 100).toFixed(2);
		if (hoveredHour <= 1)
			return `left:${(padL / W * 100).toFixed(2)}%;top:4px`;
		if (hoveredHour >= 22)
			return `right:${(padR / W * 100).toFixed(2)}%;top:4px`;
		return `left:${pct}%;transform:translateX(-50%);top:4px`;
	});
</script>

<div class="bg-surface-light rounded-xl p-4">
	<h2 class="font-bold mb-3">Umsatz pro Stunde — heute</h2>

	<div class="relative">
		<!-- HTML Tooltip: absolutely positioned over the SVG, always fully visible -->
		{#if hoveredHour !== null && hoveredBucket}
			<div
				class="absolute z-10 pointer-events-none bg-surface border border-surface-lighter rounded-lg shadow-xl px-2.5 py-2 text-xs min-w-32.5 max-w-45"
				style={tooltipStyle}
			>
				<p class="font-bold text-text mb-1.5">{hoveredHour}:00–{hoveredHour + 1}:00</p>
				{#if hoveredBucket.total > 0}
					{#each hoveredBucket.segments.slice(0, 6) as seg}
						<div class="flex items-center gap-1.5 mb-0.5">
							<span class="w-2 h-2 rounded-xs shrink-0" style="background:{seg.color}"></span>
							<span class="text-text-muted flex-1 min-w-0 truncate" title={seg.name}>{seg.name}</span>
							<span class="text-text font-semibold shrink-0 ml-1">{formatCurrency(seg.revenue)}</span>
						</div>
					{/each}
					{#if hoveredBucket.segments.length > 6}
						<p class="text-text-muted text-[10px] mt-0.5">+{hoveredBucket.segments.length - 6} weitere</p>
					{/if}
					<div class="flex justify-between items-center mt-1.5 pt-1.5 border-t border-surface-lighter">
						<span class="text-text-muted">Gesamt</span>
						<span class="font-bold text-success">{formatCurrency(hoveredBucket.total)}</span>
					</div>
				{:else}
					<p class="text-text-muted">Kein Umsatz</p>
				{/if}
			</div>
		{/if}

		<!-- SVG Chart -->
		<svg
			viewBox="0 0 {W} {H}"
			width="100%"
			preserveAspectRatio="xMidYMid meet"
			role="img"
			aria-label="Umsatz pro Stunde"
		>
			<defs>
				<!-- ClipPath per bar: gives the whole stacked bar clean rounded top corners -->
				{#each hourlyData as bucket}
					{#if bucket.total > 0}
						{@const bH = totalBarH(bucket.total)}
						<clipPath id="bar-clip-{bucket.hour}">
							<rect
								x={bx(bucket.hour)} y={baselineY - bH}
								width={barW} height={bH + 2}
								rx="2"
							/>
						</clipPath>
					{/if}
				{/each}
			</defs>

			<!-- Guide lines + Y-axis labels -->
			{#each guideValues as pct}
				{@const gy = padT + chartH - pct * chartH}
				<line x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="var(--color-surface-lighter)" stroke-width="1" />
				<text x={padL - 4} y={gy + 4} text-anchor="end" font-size="8" fill="var(--color-text-muted)"
				>{formatCurrency(maxRevenue * pct)}</text>
			{/each}

			<!-- X baseline -->
			<line x1={padL} y1={baselineY} x2={W - padR} y2={baselineY} stroke="var(--color-surface-lighter)" stroke-width="1" />

			<!-- Stacked bars -->
			{#each hourlyData as bucket}
				{#if bucket.total > 0}
					{@const stacks = buildStacks(bucket)}
					{@const isHovered = hoveredHour === bucket.hour}
					<g clip-path="url(#bar-clip-{bucket.hour})" opacity={isHovered ? 1 : 0.82} style="pointer-events:none">
						{#each stacks as seg}
							<rect x={bx(bucket.hour)} y={seg.y} width={barW} height={seg.h} fill={seg.color} />
						{/each}
					</g>
				{/if}
			{/each}

			<!-- Hit areas — on top of everything so hover always works -->
			{#each hourlyData as bucket}
				<rect
					x={padL + bucket.hour * slotW} y={padT}
					width={slotW} height={chartH}
					fill="transparent"
					onmouseenter={() => (hoveredHour = bucket.hour)}
					onmouseleave={() => (hoveredHour = null)}
					role="presentation"
				/>
			{/each}

			<!-- X-axis labels (every 4 h) -->
			{#each [0, 4, 8, 12, 16, 20] as h}
				<text
					x={padL + h * slotW + slotW / 2} y={H - 4}
					text-anchor="middle" font-size="9"
					fill={h === currentHour ? 'var(--color-success)' : 'var(--color-text-muted)'}
				>{h}:00</text>
			{/each}

			<!-- No-data placeholder -->
			{#if !hasData}
				<text
					x={W / 2} y={padT + chartH / 2 + 4}
					text-anchor="middle" font-size="11"
					fill="var(--color-text-muted)"
				>Noch keine Transaktionen heute</text>
			{/if}
		</svg>
	</div>

	<!-- Legend -->
	{#if activeProducts.length > 0}
		<div class="flex flex-wrap gap-x-4 gap-y-1 mt-3">
			{#each activeProducts as p}
				<div class="flex items-center gap-1.5 text-xs text-text-muted">
					<span class="inline-block w-2.5 h-2.5 rounded-xs shrink-0" style="background-color:{p.color}"></span>
					<span>{p.name}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

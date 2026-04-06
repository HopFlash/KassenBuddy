<script lang="ts">
	import { onMount } from 'svelte';
	import { getSettings, saveSettings } from '$lib/db';
	import type { Settings } from '$lib/types';
	import { exportBackup, importBackup } from '$lib/utils/backup';

	let settings = $state<Settings>({
		adminPin: '1234',
		currency: 'EUR',
		shopName: 'KassenBuddy',
		quickDiscountPercents: [5, 10, 20],
		drinkQuotaCounter: 0
	});
	let discountInputs = $state(['5', '10', '20']);
	let quotaCounterInput = $state('0');
	let newPin = $state('');
	let confirmPin = $state('');
	let pinError = $state('');
	let pinSuccess = $state('');
	let generalError = $state('');
	let backupStatus = $state('');
	let backupError = $state('');
	let importLoading = $state(false);
	let exportLoading = $state(false);
	let importConfirm = $state(false);
	let pendingImportFile = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let saved = $state(false);

	onMount(async () => {
		settings = await getSettings();
		discountInputs = settings.quickDiscountPercents.map((p) => String(p));
		quotaCounterInput = String(settings.drinkQuotaCounter);
	});

	function parseQuickDiscounts(): [number, number, number] | null {
		if (discountInputs.length !== 3) return null;
		const parsed = discountInputs.map((value) =>
			Number.parseFloat(String(value).replace(',', '.'))
		);
		if (parsed.some((value) => !Number.isFinite(value))) return null;
		if (parsed.some((value) => value <= 0 || value > 100)) return null;
		return [parsed[0], parsed[1], parsed[2]];
	}

	async function handleSaveGeneral() {
		generalError = '';
		try {
			const quickDiscountPercents = parseQuickDiscounts();
			if (!quickDiscountPercents) {
				generalError = 'Schnellrabatte müssen 3 Zahlen zwischen 0,1 und 100 sein';
				return;
			}

			const parsedQuotaCounter = Number.parseInt(String(quotaCounterInput), 10);
			if (Number.isNaN(parsedQuotaCounter)) {
				generalError = 'Kontingent-Zähler muss eine ganze Zahl sein';
				return;
			}

			settings.quickDiscountPercents = quickDiscountPercents;
			settings.drinkQuotaCounter = parsedQuotaCounter;
			await saveSettings(settings);
			saved = true;
			setTimeout(() => (saved = false), 2000);
		} catch {
			generalError = 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
		}
	}

	async function handleExport() {
		exportLoading = true;
		backupError = '';
		try {
			await exportBackup();
			backupStatus = 'Backup erfolgreich exportiert';
			setTimeout(() => (backupStatus = ''), 3000);
		} catch (e) {
			backupError = e instanceof Error ? e.message : 'Export fehlgeschlagen';
		} finally {
			exportLoading = false;
		}
	}

	function handleFileSelected(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		pendingImportFile = file;
		importConfirm = true;
	}

	async function confirmImport() {
		if (!pendingImportFile) return;
		importLoading = true;
		backupError = '';
		importConfirm = false;
		try {
			await importBackup(pendingImportFile);
			settings = await getSettings();
			discountInputs = settings.quickDiscountPercents.map((p) => String(p));
			quotaCounterInput = String(settings.drinkQuotaCounter);
			backupStatus = 'Backup erfolgreich importiert';
			setTimeout(() => (backupStatus = ''), 4000);
		} catch (e) {
			backupError = e instanceof Error ? e.message : 'Import fehlgeschlagen';
		} finally {
			importLoading = false;
			pendingImportFile = null;
			if (fileInput) fileInput.value = '';
		}
	}

	function cancelImport() {
		importConfirm = false;
		pendingImportFile = null;
		if (fileInput) fileInput.value = '';
	}

	async function handleChangePin() {
		pinError = '';
		pinSuccess = '';

		if (newPin.length < 4) {
			pinError = 'PIN muss mindestens 4 Stellen haben';
			return;
		}
		if (newPin !== confirmPin) {
			pinError = 'PINs stimmen nicht überein';
			return;
		}

		settings.adminPin = newPin;
		await saveSettings(settings);
		newPin = '';
		confirmPin = '';
		pinSuccess = 'PIN geändert';
		setTimeout(() => (pinSuccess = ''), 3000);
	}
</script>

<h1 class="text-2xl font-bold mb-6">Einstellungen</h1>

<div class="max-w-lg space-y-6">
	<!-- General -->
	<div class="bg-surface-light rounded-xl p-6">
		<h2 class="font-bold mb-4">Allgemein</h2>
		<div class="space-y-4">
			<div>
				<label for="quota-counter" class="block text-sm text-text-muted mb-1">Getränke-Kontingent (aktueller Zählerstand)</label>
				<input
					id="quota-counter"
					type="number"
					step="1"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={quotaCounterInput}
					placeholder="z. B. 300"
				/>
				<p class="text-xs text-text-muted mt-1">Wird bei jedem Verkauf automatisch reduziert. Kann negativ werden.</p>
			</div>

			<div>
				<p class="block text-sm text-text-muted mb-1">Schnellrabatte (%)</p>
				<div class="grid grid-cols-3 gap-2">
					{#each [0, 1, 2] as idx}
						<input
							type="number"
							min="0.1"
							max="100"
							step="0.1"
							class="w-full bg-surface-lighter rounded-lg px-3 py-2 text-text outline-none focus:ring-2 focus:ring-accent"
							bind:value={discountInputs[idx]}
							placeholder="%"
						/>
					{/each}
				</div>
				<p class="text-xs text-text-muted mt-1">Diese 3 Werte erscheinen als Rabatt-Buttons in der Kasse.</p>
			</div>

			{#if generalError}
				<p class="text-danger text-sm">{generalError}</p>
			{/if}

			<div>
				<label for="shopname" class="block text-sm text-text-muted mb-1">Kassenname</label>
				<input
					id="shopname"
					type="text"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={settings.shopName}
				/>
				<p class="text-xs text-text-muted mt-1">Wird im Excel-Export als Titel verwendet</p>
			</div>
			<button
				type="button"
				class="bg-accent hover:bg-accent-hover text-white rounded-xl px-6 py-3 font-semibold transition-colors"
				onclick={handleSaveGeneral}
			>
				{saved ? '✓ Gespeichert' : 'Speichern'}
			</button>
		</div>
	</div>

	<!-- PIN Change -->
	<div class="bg-surface-light rounded-xl p-6">
		<h2 class="font-bold mb-4">Admin-PIN ändern</h2>
		<div class="space-y-4">
			<div>
				<label for="newpin" class="block text-sm text-text-muted mb-1">Neuer PIN</label>
				<input
					id="newpin"
					type="password"
					inputmode="numeric"
					maxlength="6"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={newPin}
					placeholder="Mindestens 4 Stellen"
				/>
			</div>
			<div>
				<label for="confirmpin" class="block text-sm text-text-muted mb-1">PIN bestätigen</label>
				<input
					id="confirmpin"
					type="password"
					inputmode="numeric"
					maxlength="6"
					class="w-full bg-surface-lighter rounded-lg px-4 py-3 text-text outline-none focus:ring-2 focus:ring-accent"
					bind:value={confirmPin}
					placeholder="Nochmal eingeben"
				/>
			</div>

			{#if pinError}
				<p class="text-danger text-sm">{pinError}</p>
			{/if}
			{#if pinSuccess}
				<p class="text-success text-sm">{pinSuccess}</p>
			{/if}

			<button
				type="button"
				class="bg-warning/20 hover:bg-warning/30 text-warning rounded-xl px-6 py-3 font-semibold transition-colors"
				onclick={handleChangePin}
			>
				PIN ändern
			</button>
		</div>
	</div>

	<!-- Backup / Restore -->
	<div class="bg-surface-light rounded-xl p-6">
		<h2 class="font-bold mb-1">Datensicherung</h2>
		<p class="text-sm text-text-muted mb-4">Exportiert alle Produkte inkl. Bilder und Einstellungen als einzelne JSON-Datei.</p>

		<div class="flex flex-col gap-3">
			<button
				type="button"
				class="bg-accent hover:bg-accent-hover text-white rounded-xl px-6 py-3 font-semibold transition-colors disabled:opacity-50"
				onclick={handleExport}
				disabled={exportLoading}
			>
				{exportLoading ? '⏳ Exportiere…' : '⬇️ Backup exportieren'}
			</button>

			<div>
				<label for="backup-file" class="block text-sm text-text-muted mb-1">Backup importieren</label>
				<input
					id="backup-file"
					bind:this={fileInput}
					type="file"
					accept=".json,application/json"
					class="block w-full text-sm text-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-surface-lighter file:text-text file:font-semibold hover:file:bg-accent/20 cursor-pointer"
					onchange={handleFileSelected}
					disabled={importLoading}
				/>
			</div>

			{#if importConfirm && pendingImportFile}
				<div class="bg-warning/10 border border-warning/40 rounded-xl p-4 flex flex-col gap-3">
					<p class="text-sm text-warning font-semibold">⚠️ Alle vorhandenen Produkte und Einstellungen werden überschrieben!</p>
					<p class="text-xs text-text-muted">Datei: {pendingImportFile.name}</p>
					<div class="flex gap-2">
						<button
							type="button"
							class="bg-danger/20 hover:bg-danger/30 text-danger rounded-xl px-4 py-2 font-semibold text-sm transition-colors"
							onclick={confirmImport}
						>
							Ja, importieren
						</button>
						<button
							type="button"
							class="bg-surface-lighter hover:opacity-80 rounded-xl px-4 py-2 font-semibold text-sm transition-colors"
							onclick={cancelImport}
						>
							Abbrechen
						</button>
					</div>
				</div>
			{/if}

			{#if importLoading}
				<p class="text-sm text-text-muted">⏳ Importiere Backup…</p>
			{/if}

			{#if backupStatus}
				<p class="text-success text-sm">{backupStatus}</p>
			{/if}
			{#if backupError}
				<p class="text-danger text-sm">{backupError}</p>
			{/if}
		</div>
	</div>
</div>

import * as XLSX from 'xlsx';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Kassentag, Transaction } from '$lib/types';
import {
	exportProductSummaryToXlsx,
	exportTransactionsToJson,
	exportTransactionsToXlsx,
	parseTransactionsJson
} from '$lib/utils/export';

const xlsxCapture = vi.hoisted(() => ({ blob: undefined as Blob | undefined }));

vi.mock('xlsx', async (importOriginal) => {
	const actual = await importOriginal<typeof import('xlsx')>();
	return {
		...actual,
		writeFile: (workbook: XLSX.WorkBook) => {
			const binary = actual.write(workbook, { bookType: 'xlsx', type: 'binary' }) as string;
			const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
			xlsxCapture.blob = new Blob([bytes.buffer as ArrayBuffer]);
		}
	};
});

const kassentag: Kassentag = {
	id: 'day-1',
	startedAt: new Date(2026, 8, 20, 20, 14).getTime(),
	endedAt: new Date(2026, 8, 21, 3, 40).getTime(),
	status: 'closed',
	source: 'manual'
};

const transaction: Transaction = {
	id: 'transaction-1234',
	timestamp: new Date(2026, 8, 20, 21).getTime(),
	items: [
		{
			productId: 'product-1',
			productName: 'Apfelsaft',
			price: 2.5,
			quantity: 2,
			subtotal: 5
		}
	],
	total: 5,
	amountPaid: 10,
	change: 5,
	paymentMethod: 'cash',
	kassentagId: kassentag.id
};

async function captureWorkbook(
	exportWorkbook: () => void
): Promise<XLSX.WorkBook> {
	xlsxCapture.blob = undefined;
	exportWorkbook();
	expect(xlsxCapture.blob).toBeDefined();
	return XLSX.read(await xlsxCapture.blob!.arrayBuffer(), { type: 'array' });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Kassentag export labeling', () => {
	it('labels the transaction sheet and starts its table on row 3', async () => {
		const workbook = await captureWorkbook(() =>
			exportTransactionsToXlsx([transaction], 'Kasse', kassentag)
		);
		const sheet = workbook.Sheets.Transaktionen;

		expect(sheet.A1.v).toBe('Kassentag: 20.09.2026, 20:14 – 21.09.2026, 03:40');
		expect(sheet.A2).toBeUndefined();
		expect(sheet.A3.v).toBe('Datum');
		expect(sheet.B3.v).toBe('Transaktions-ID');
		expect(sheet.A4.v).toBe('20.09.2026, 21:00');
		expect(sheet.D4.v).toBe('Apfelsaft');
	});

	it('labels the product summary sheet and starts its table on row 3', async () => {
		const workbook = await captureWorkbook(() =>
			exportProductSummaryToXlsx([transaction], 'Kasse', kassentag)
		);
		const sheet = workbook.Sheets.Produkte;

		expect(sheet.A1.v).toBe('Kassentag: 20.09.2026, 20:14 – 21.09.2026, 03:40');
		expect(sheet.A2).toBeUndefined();
		expect(sheet.A3.v).toBe('Produkt');
		expect(sheet.B3.v).toBe('Anzahl verkauft');
		expect(sheet.A4.v).toBe('Apfelsaft');
	});

	it('labels both first sheets for all Kassentage when the period is null or omitted', async () => {
		const transactionWorkbook = await captureWorkbook(() =>
			exportTransactionsToXlsx([transaction], 'Kasse', null)
		);
		const summaryWorkbook = await captureWorkbook(() =>
			exportProductSummaryToXlsx([transaction], 'Kasse')
		);

		expect(transactionWorkbook.Sheets.Transaktionen.A1.v).toBe('Alle Kassentage');
		expect(transactionWorkbook.Sheets.Transaktionen.A3.v).toBe('Datum');
		expect(summaryWorkbook.Sheets.Produkte.A1.v).toBe('Alle Kassentage');
		expect(summaryWorkbook.Sheets.Produkte.A3.v).toBe('Produkt');
	});

	it('exports JSON with the selected Kassentag and transactions', async () => {
		let capturedBlob: Blob | undefined;
		vi.stubGlobal('document', {
			createElement: () => ({ click: vi.fn() })
		});
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn((blob: Blob) => {
				capturedBlob = blob;
				return 'blob:test';
			}),
			revokeObjectURL: vi.fn()
		});

		exportTransactionsToJson([transaction], 'Kasse', kassentag);

		expect(capturedBlob).toBeDefined();
		expect(JSON.parse(await capturedBlob!.text())).toEqual({
			kassentag,
			transactions: [transaction]
		});
	});

	it('exports JSON with a null Kassentag when all Kassentage are selected', async () => {
		let capturedBlob: Blob | undefined;
		vi.stubGlobal('document', {
			createElement: () => ({ click: vi.fn() })
		});
		vi.stubGlobal('URL', {
			createObjectURL: vi.fn((blob: Blob) => {
				capturedBlob = blob;
				return 'blob:test';
			}),
			revokeObjectURL: vi.fn()
		});

		exportTransactionsToJson([transaction], 'Kasse');

		expect(JSON.parse(await capturedBlob!.text())).toEqual({
			kassentag: null,
			transactions: [transaction]
		});
	});
});

describe('transaction JSON import', () => {
	const parse = (value: string) =>
		parseTransactionsJson({ text: async () => value } as File);

	it('imports the legacy bare-array shape and normalizes missing Kassentag IDs', async () => {
		const legacyTransaction = { ...transaction };
		delete (legacyTransaction as Partial<Transaction>).kassentagId;

		await expect(parse(JSON.stringify([legacyTransaction]))).resolves.toEqual([
			{ ...legacyTransaction, kassentagId: null }
		]);
	});

	it('imports the new wrapper shape and preserves a string Kassentag ID', async () => {
		await expect(
			parse(JSON.stringify({ kassentag, transactions: [transaction] }))
		).resolves.toEqual([transaction]);
	});

	it('normalizes invalid Kassentag IDs to null', async () => {
		const transactionWithInvalidId = { ...transaction, kassentagId: 42 };

		await expect(
			parse(JSON.stringify({ kassentag: null, transactions: [transactionWithInvalidId] }))
		).resolves.toEqual([{ ...transaction, kassentagId: null }]);
	});

	it('reports invalid JSON explicitly', async () => {
		await expect(parse('{')).rejects.toThrow('Ungültige JSON-Datei');
	});

	it('rejects an invalid wrapper structure', async () => {
		await expect(parse(JSON.stringify({ kassentag, transactions: {} }))).rejects.toThrow(
			'JSON muss ein Array von Transaktionen oder ein Export-Objekt mit "transactions" enthalten'
		);
		await expect(parse(JSON.stringify(null))).rejects.toThrow(
			'JSON muss ein Array von Transaktionen oder ein Export-Objekt mit "transactions" enthalten'
		);
	});

	it('reports a malformed transaction shape explicitly', async () => {
		await expect(
			parse(JSON.stringify({ kassentag: null, transactions: [{ id: 'missing-fields' }] }))
		).rejects.toThrow('Ungültiges Format: Jeder Eintrag benötigt id, timestamp und items');
	});
});

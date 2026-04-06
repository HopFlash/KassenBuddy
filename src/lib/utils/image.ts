const urlCache = new Map<string, string>();

function createBlobUrl(blob: Blob): string {
	return URL.createObjectURL(blob);
}

export function getBlobUrl(productId: string, blob: Blob | null): string | null {
	if (!blob) return null;

	const cached = urlCache.get(productId);
	if (cached) return cached;

	const url = createBlobUrl(blob);
	urlCache.set(productId, url);
	return url;
}

export function revokeBlobUrl(productId: string): void {
	const cached = urlCache.get(productId);
	if (cached) {
		URL.revokeObjectURL(cached);
		urlCache.delete(productId);
	}
}

export function revokeAllBlobUrls(): void {
	for (const url of urlCache.values()) {
		URL.revokeObjectURL(url);
	}
	urlCache.clear();
}

export async function fileToBlob(file: File): Promise<Blob> {
	const buffer = await file.arrayBuffer();
	return new Blob([buffer], { type: file.type });
}

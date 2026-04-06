declare module 'virtual:pwa-info' {
	const pwaInfo:
		| {
				webManifest: {
					linkTag: string;
					href: string;
				};
		  }
		| undefined;
	export { pwaInfo };
}

declare module 'virtual:pwa-register/svelte' {
	import type { Writable } from 'svelte/store';

	export interface RegisterSWOptions {
		immediate?: boolean;
		onNeedRefresh?: () => void;
		onOfflineReady?: () => void;
		onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void;
		onRegisterError?: (error: unknown) => void;
	}

	export function useRegisterSW(options?: RegisterSWOptions): {
		needRefresh: Writable<boolean>;
		offlineReady: Writable<boolean>;
		updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
	};
}

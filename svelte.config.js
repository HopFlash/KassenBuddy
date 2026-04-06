import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		paths: {
			relative: true
		},
		serviceWorker: {
			register: false // handled by vite-pwa
		}
	}
};

export default config;

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		conditions: ['browser']
	},
	test: {
		environment: 'node',
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.test.ts', 'tests/**/*.test.ts']
	}
});

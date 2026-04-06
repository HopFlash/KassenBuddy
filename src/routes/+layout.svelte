<script lang="ts">
	import '../app.css';
	import { base } from '$app/paths';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="manifest" href="{base}/manifest.webmanifest" />
	<title>KassenBuddy</title>
</svelte:head>

<div class="h-screen w-screen overflow-hidden bg-surface">
	{@render children()}
</div>

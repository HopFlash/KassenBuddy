// Post-build script: rewrite absolute asset paths to relative paths in all
// HTML files so the app can be opened directly via file:// without a server.
import { readFileSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { readdirSync, statSync } from 'fs';

const BUILD_DIR = 'build';

function walk(dir) {
	const results = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) results.push(...walk(full));
		else results.push(full);
	}
	return results;
}

let patched = 0;
for (const file of walk(BUILD_DIR)) {
	if (!file.endsWith('.html')) continue;

	const fileDir = dirname(file);
	// Relative path from this HTML file's directory back to the build root
	const rel = relative(fileDir, BUILD_DIR).replace(/\\/g, '/');
	const prefix = rel ? rel + '/' : './';

	let content = readFileSync(file, 'utf8');
	// Replace all absolute src/href/url( that start with /_app/ or /pwa- or /registerSW etc.
	const original = content;
	content = content.replace(/(href|src)="\//g, `$1="${prefix}`);
	// Also fix manifest.webmanifest link and any remaining root-relative /static refs
	content = content.replace(/url\(\//g, `url(${prefix}`);

	if (content !== original) {
		writeFileSync(file, content, 'utf8');
		console.log(`Patched: ${file}`);
		patched++;
	}
}

console.log(`fix-paths: ${patched} file(s) updated.`);

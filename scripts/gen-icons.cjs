const fs = require('fs');

function createSvgIcon(size) {
  const rx = Math.round(size * 0.15);
  const fontSize = Math.round(size * 0.45);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#1e293b" rx="${rx}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" fill="#f8fafc" font-family="Arial,sans-serif" font-weight="bold">K</text>
</svg>`;
}

fs.writeFileSync('static/pwa-192x192.svg', createSvgIcon(192));
fs.writeFileSync('static/pwa-512x512.svg', createSvgIcon(512));
fs.writeFileSync('static/favicon.svg', createSvgIcon(32));
console.log('Icons created');

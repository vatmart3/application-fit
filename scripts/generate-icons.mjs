/**
 * Génère les icônes PWA (PNG) à partir d'un SVG, via Chromium headless.
 * Usage : node scripts/generate-icons.mjs [cheminChromium]
 */
import { chromium } from "playwright";
import fs from "node:fs";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b1120"/>
  <polygon points="96,40 472,40 472,416 416,472 40,472 40,96" fill="#121a2e" stroke="#ff6a1a" stroke-width="10"/>
  <path d="M120 380 L120 150 L200 150 L256 250 L312 150 L392 150 L392 380 L330 380 L330 260 L256 370 L182 260 L182 380 Z" fill="#f6ecd9"/>
  <rect x="120" y="400" width="272" height="16" fill="#b6ff2e"/>
</svg>`;

const browser = await chromium.launch({ executablePath: process.argv[2] || undefined });
const page = await browser.newPage();
fs.mkdirSync("public/icons", { recursive: true });
for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size)}</body></html>`);
  await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: false });
}
fs.writeFileSync("public/icons/icon.svg", svg(512));
await browser.close();
console.log("icônes générées");

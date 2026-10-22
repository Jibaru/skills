#!/usr/bin/env node
/**
 * rasterize_svg.mjs — turn an OFFICIAL brand SVG into a transparent PNG at any width, optionally recoloured.
 *
 *   node rasterize_svg.mjs brand/logotype.svg out/logo_white.png --width 3000 --replace "#131316=#FFFFFF" --replace "#6C47FF=#FFFFFF"
 *   node rasterize_svg.mjs brand/symbol.svg out/symbol.png --width 1200
 *
 * Generalised from clerk-van/tools/rasterize_logos.js. Never redraw a logo by hand or trace it: take the
 * brand's own SVG (press kit / brand-assets page) and let a real browser render it, so curves, kerning and
 * proportions are exact. Recolouring is a literal string swap of the fill values in the SVG source, which
 * works for flat brand marks that use a handful of hex colours. Check which ones with:
 *   grep -o '#[0-9A-Fa-f]\{6\}' file.svg | sort -u
 * Uses playwright-core + the system Chrome (no browser download). `npm i playwright-core` where you run it.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const [src, out] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
if (!src || !out) {
  console.error("usage: node rasterize_svg.mjs <in.svg> <out.png> [--width 3000] [--replace FROM=TO]...");
  process.exit(2);
}
const width = Number(args[args.indexOf("--width") + 1] || 0) || 3000;
const replacements = args.flatMap((a, i) => (a === "--replace" ? [args[i + 1].split("=")] : []));
const chrome = process.env.CHROME || (process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");

let pw;
try {
  pw = createRequire(path.resolve("package.json"))("playwright-core");
} catch {
  console.error("rasterize_svg: playwright-core not found. Run `npm i playwright-core` here or set NODE_PATH.");
  process.exit(2);
}

let svg = fs.readFileSync(src, "utf8");
for (const [from, to] of replacements) {
  if (!svg.includes(from)) console.warn(`warning: ${from} not found in ${src}`);
  svg = svg.split(from).join(to);
}
const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
if (!vb) {
  console.error(`rasterize_svg: no viewBox in ${src}; can't derive the aspect ratio`);
  process.exit(1);
}
const height = Math.round(width * Number(vb[2]) / Number(vb[1]));

const browser = await pw.chromium.launch({ executablePath: chrome, headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const sized = svg.replace("<svg ", `<svg style="width:${width}px;height:${height}px;display:block" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${sized}</body></html>`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width, height } });
  console.log(`wrote ${out} ${width}x${height}`);
} finally {
  await browser.close();
}

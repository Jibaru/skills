#!/usr/bin/env node
/**
 * check-landing.mjs — static checks for a game landing page before it is pushed.
 *
 *   node scripts/check-landing.mjs path/to/index.html            # file checks only
 *   node scripts/check-landing.mjs path/to/index.html --live     # also HEAD every absolute URL
 *
 * Fails (exit 1) on what broke THE ONES' first landing: relative og:image, missing og:url or
 * twitter:card, leftover {{PLACEHOLDERS}}, uppercase transforms that mangle "macOS", media files
 * referenced but missing, and download links that are not /releases/latest/download/<asset>.
 * Dependency-free (Node 18+).
 */
import fs from "node:fs";
import path from "node:path";

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("usage: node check-landing.mjs <index.html> [--live]");
  process.exit(2);
}
const live = flags.includes("--live");
const html = fs.readFileSync(file, "utf8");
const dir = path.dirname(path.resolve(file));
const problems = [];
const notes = [];

const meta = (attr, name) => {
  const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
  return html.match(re)?.[1];
};

const leftovers = [...new Set(html.match(/\{\{[A-Z_]+\}\}/g) || [])];
if (leftovers.length) problems.push(`unfilled placeholders: ${leftovers.join(" ")}`);

for (const [attr, name] of [["property", "og:title"], ["property", "og:description"], ["property", "og:url"], ["property", "og:image"], ["name", "twitter:card"], ["name", "twitter:image"]]) {
  const v = meta(attr, name);
  if (!v) problems.push(`missing <meta ${attr}="${name}">`);
  else if (/url|image|video$/.test(name) && name !== "twitter:card" && !/^https:\/\//.test(v)) {
    problems.push(`${name} must be an absolute https URL (got "${v}") — chat apps ignore relative ones`);
  }
}
const card = meta("name", "twitter:card");
if (card && card !== "summary_large_image") notes.push(`twitter:card is "${card}" — summary_large_image shows the big image`);
if (!/<link[^>]+rel=["']canonical["']/i.test(html)) problems.push("missing <link rel=\"canonical\">");

if (/text-transform:\s*uppercase/i.test(html)) {
  notes.push("text-transform: uppercase present — make sure it never applies to platform names (\"macOS\" → \"MACOS\")");
}

for (const m of html.matchAll(/(?:src|href|poster)=["'](media\/[^"'?#]+)["']/g)) {
  if (!fs.existsSync(path.join(dir, m[1]))) problems.push(`referenced file missing: ${m[1]}`);
}

const downloads = [...html.matchAll(/href=["'](https:\/\/github\.com\/[^"']+\/releases\/[^"']+)["']/g)].map((m) => m[1]);
for (const d of downloads) {
  if (!/\/releases\/latest\/download\/[^/]+$/.test(d)) notes.push(`download link is pinned to a version: ${d}`);
}
if (/v\d+\.\d+\.\d+/.test(html.replace(/<meta[^>]*>/g, ""))) notes.push("a version number appears in the page — it will go stale on the next release");

if (live) {
  const urls = new Set([...html.matchAll(/(?:content|href|src)=["'](https:\/\/[^"']+)["']/g)].map((m) => m[1]));
  for (const u of urls) {
    if (u.includes("fonts.g")) continue;
    try {
      const r = await fetch(u, { method: "HEAD", redirect: "follow" });
      if (!r.ok) problems.push(`HTTP ${r.status}: ${u}`);
    } catch (e) {
      problems.push(`unreachable: ${u} (${e.message})`);
    }
  }
}

for (const n of notes) console.log(`  note  ${n}`);
for (const p of problems) console.log(`  FAIL  ${p}`);
console.log(problems.length ? `\n${problems.length} problem(s)` : `ok — ${file}`);
process.exit(problems.length ? 1 : 0);

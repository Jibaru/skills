#!/usr/bin/env node
/**
 * find-control-bytes.mjs — list source files containing ASCII control bytes.
 *
 * A heredoc or `-e` string can turn `\b` into 0x08 or `\t` into a real tab inside a regex, and
 * the line still reads correctly on screen. This finds them, byte for byte, with no dependence on
 * grep flavour or locale (`grep -P` refuses to run in some locales and a bad fallback matches
 * everything).
 *
 *   node scripts/find-control-bytes.mjs src scripts
 *   node scripts/find-control-bytes.mjs path/to/file.ts
 *
 * Tab (0x09), LF (0x0A) and CR (0x0D) are allowed; everything else below 0x20 is reported with
 * its line, column and hex value. Exit code 1 when anything is found.
 */
import fs from "node:fs";
import path from "node:path";

const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".md", ".mdx", ".py", ".go", ".sql", ".sh", ".yml", ".yaml"]);
const SKIP = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo", ".source"]);
const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: node find-control-bytes.mjs <file-or-dir>...");
  process.exit(2);
}

const files = [];
const walk = (p) => {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(p)) if (!SKIP.has(entry)) walk(path.join(p, entry));
  } else if (EXTENSIONS.has(path.extname(p))) {
    files.push(p);
  }
};
for (const t of targets) walk(t);

let hits = 0;
for (const file of files) {
  const bytes = fs.readFileSync(file);
  let line = 1;
  let column = 1;
  for (const byte of bytes) {
    if (byte === 0x0a) {
      line += 1;
      column = 1;
      continue;
    }
    if (byte < 0x20 && !ALLOWED.has(byte)) {
      hits += 1;
      const hex = byte.toString(16).padStart(2, "0");
      console.log(`${file}:${line}:${column}  0x${hex}`);
    }
    column += 1;
  }
}

console.log(hits ? `\n${hits} control byte(s) found` : `ok: ${files.length} file(s) clean`);
process.exit(hits ? 1 : 0);

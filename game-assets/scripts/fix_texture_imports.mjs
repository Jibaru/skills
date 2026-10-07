#!/usr/bin/env node
// Godot 4: make 3D textures VRAM-compressed with mipmaps, and flag normal maps.
//
// Headless `--import` never runs the editor's "detect 3D" pass, so textures that code loads (or that a
// GLB extracts next to itself) stay lossless and mip-less: shimmer at distance, VRAM bloat, normal maps
// treated as colour. A per-folder `sed` on *.jpg.import kept missing the PNG sets (ambientCG
// vegetation ships PNG), so this is one script, run as one step after every asset batch.
//
// Usage: node fix_texture_imports.mjs [--dry] [dirs...]   (default: assets/textures assets/models)
// Then:  godot --headless --path . --import
import fs from "node:fs";
import path from "node:path";

const dry = process.argv.includes("--dry");
const dirs = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const roots = dirs.length ? dirs : ["assets/textures", "assets/models"];
const NORMAL = /(nor_gl|normalgl|_normal|_nrm|_nor\b|_n\.)/i;
let changed = 0, seen = 0;
const changedFiles = [];
const walk = (d) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
  const p = path.join(d, e.name);
  if (e.isDirectory()) return walk(p);
  if (!/\.(png|jpe?g|webp|tga)\.import$/i.test(e.name)) return;
  seen++;
  const src = fs.readFileSync(p, "utf8");
  if (!src.includes('importer="texture"')) return;          // skip 2D/UI importers you set on purpose
  let out = src.replace(/^compress\/mode=\d+/m, "compress/mode=2")
    .replace(/^mipmaps\/generate=false/m, "mipmaps/generate=true")
    .replace(/^detect_3d\/compress_to=\d+/m, "detect_3d/compress_to=0");
  if (NORMAL.test(e.name)) out = out.replace(/^compress\/normal_map=\d+/m, "compress/normal_map=1");
  if (out !== src) {
    changed++;
    changedFiles.push(p.split(path.sep).join("/"));
    if (!dry) fs.writeFileSync(p, out);
  }
});
roots.forEach(walk);
for (const f of changedFiles.slice(0, 10)) console.log(`  ${f}`);
if (changedFiles.length > 10) console.log(`  … ${changedFiles.length - 10} more`);
console.log(`${dry ? "would change" : "changed"} ${changed} of ${seen} texture .import files${dry || !changed ? "" : " — now run godot --headless --path . --import"}`);

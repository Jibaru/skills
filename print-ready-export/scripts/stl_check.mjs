#!/usr/bin/env node
/**
 * stl_check.mjs — is this STL printable? Reads the bytes that were actually written.
 *
 * Blender can drop degenerate faces while saving, so a mesh that was closed inside the script can
 * have holes in the file. This checks the file itself: binary STL (80-byte header, uint32 count,
 * 50-byte records), vertices welded by position (rounded to 1e-5 of the file unit), every
 * triangle's three undirected edges counted.
 *
 *   node stl_check.mjs model.stl [more.stl ...]
 *   node stl_check.mjs body.stl --max-boundary 200     # accept a known number of slicer-repairable slits
 *
 *   boundary  edges used by ONE triangle  → real holes; must be 0 (or a few slits a slicer repairs)
 *   shared    edges used by 3+ triangles  → overlapping closed shells touching; harmless, slicers union them
 *
 * No dependencies. ASCII STL is not supported (export binary).
 */
import fs from "node:fs";

function check(file) {
  const buf = fs.readFileSync(file);
  if (buf.length < 84) throw new Error(`${file}: too short to be a binary STL`);
  const n = buf.readUInt32LE(80);
  if (84 + n * 50 !== buf.length) {
    const head = buf.subarray(0, 5).toString("ascii");
    throw new Error(`${file}: size ${buf.length} != 84 + ${n}×50${head === "solid" ? " (ASCII STL? export binary)" : ""}`);
  }

  const ids = new Map();
  const vid = (x, y, z) => {
    const k = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    return id;
  };

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const edges = new Map();
  let degenerate = 0;
  for (let t = 0; t < n; t++) {
    const o = 84 + t * 50 + 12; // skip the normal
    const v = [];
    for (let k = 0; k < 3; k++) {
      const x = buf.readFloatLE(o + k * 12);
      const y = buf.readFloatLE(o + k * 12 + 4);
      const z = buf.readFloatLE(o + k * 12 + 8);
      const c = [x, y, z];
      for (let a = 0; a < 3; a++) {
        if (c[a] < min[a]) min[a] = c[a];
        if (c[a] > max[a]) max[a] = c[a];
      }
      v.push(vid(x, y, z));
    }
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) {
      degenerate++;
      continue;
    }
    for (const [a, b] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) {
      const key = a < b ? a * 4294967296 + b : b * 4294967296 + a;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }

  let boundary = 0;
  let shared = 0;
  for (const c of edges.values()) {
    if (c === 1) boundary++;
    else if (c > 2) shared++;
  }
  const size = max.map((m, a) => m - min[a]);
  return { file, triangles: n, vertices: ids.size, size, boundary, shared, degenerate, bytes: buf.length };
}

const args = process.argv.slice(2);
let maxBoundary = 0;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--max-boundary") maxBoundary = Number(args[++i]);
  else files.push(args[i]);
}
if (!files.length) {
  console.error("usage: node stl_check.mjs model.stl [more.stl ...] [--max-boundary N]");
  process.exit(2);
}
let over = 0;
for (const f of files) {
  const r = check(f);
  if (r.boundary > maxBoundary) over++;
  const mm = r.size.map((s) => s.toFixed(1)).join(" x ");
  console.log(`${r.file}`);
  console.log(`  ${r.triangles} triangles, ${r.vertices} welded vertices, ${(r.bytes / 1e6).toFixed(1)} MB`);
  console.log(`  size ${mm} (file units; Blender's stl_export with global_scale writes mm)`);
  console.log(`  boundary edges ${r.boundary}  (holes${r.boundary ? "" : ": none"})`);
  console.log(`  shared edges   ${r.shared}  (overlapping shells, harmless)`);
  if (r.degenerate) console.log(`  degenerate triangles ${r.degenerate}`);
}
// exit 1 when any file has more boundary edges than allowed (default 0)
process.exit(over ? 1 : 0);

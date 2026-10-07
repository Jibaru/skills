#!/usr/bin/env node
// Dump the images embedded in a .glb and list its materials, to look at UV islands before writing a
// recolor shader (and to see which mesh has no albedo texture at all, e.g. whiskers).
// Usage: node glb_textures.mjs model.glb [outdir]
import fs from "node:fs";
import path from "node:path";

const [file, out = "."] = process.argv.slice(2);
if (!file) {
  console.error("usage: node glb_textures.mjs model.glb [outdir]");
  process.exit(2);
}
const b = fs.readFileSync(file);
if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB (magic "glTF" missing)`);
const jsonLen = b.readUInt32LE(12);
if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first chunk is not JSON");
const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
const bin = b.subarray(20 + jsonLen + 8);               // BIN chunk payload (after its 8-byte header)
fs.mkdirSync(out, { recursive: true });
console.log("materials:", (j.materials || []).map((m, i) => `${i}:${m.name} baseColorTex=${m.pbrMetallicRoughness?.baseColorTexture?.index ?? "-"} normalTex=${m.normalTexture?.index ?? "-"}`).join("  "));
(j.images || []).forEach((im, k) => {
  if (im.bufferView === undefined) return console.log(`image ${k}: external uri ${im.uri}`);
  const bv = j.bufferViews[im.bufferView];
  const ext = (im.mimeType || "").includes("png") ? "png" : "jpg";
  const f = path.join(out, `${path.basename(file, ".glb")}_img${k}.${ext}`);
  fs.writeFileSync(f, bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength));
  console.log(`image ${k} (${im.name ?? "unnamed"}) -> ${f}`);
});

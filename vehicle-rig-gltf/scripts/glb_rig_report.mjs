#!/usr/bin/env node
/**
 * glb_rig_report.mjs — what a GLB actually exports for a rig: named nodes, animations (clip names,
 * channel targets, durations), KHR_lights_punctual lights and materials. Dependency-free: parses the
 * GLB header and the JSON chunk; buffers are only read for animation input accessors' min/max.
 *
 *   node glb_rig_report.mjs model.glb
 *   node glb_rig_report.mjs model.glb --expect Door_FL,Door_Slide,Wheel_FL,Light_HeadL
 *   node glb_rig_report.mjs model.glb --json
 *
 * --expect: comma-separated node names that must exist (exit 1 if any is missing) — the contract
 * between the Blender build and the engines (Three.js, Godot) that look nodes up by name.
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: node glb_rig_report.mjs <model.glb> [--expect A,B,C] [--json]");
  process.exit(2);
}
const expectIdx = args.indexOf("--expect");
const expected = expectIdx >= 0 ? (args[expectIdx + 1] || "").split(",").filter(Boolean) : [];
const asJson = args.includes("--json");

const buf = fs.readFileSync(file);
if (buf.toString("ascii", 0, 4) !== "glTF") throw new Error(`${file} is not a GLB (no glTF magic)`);
const jsonLen = buf.readUInt32LE(12);
if (buf.toString("ascii", 16, 20) !== "JSON") throw new Error("first chunk is not JSON");
const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));

const nodes = gltf.nodes || [];
const named = nodes.map((n, i) => ({ i, name: n.name || `#${i}`, mesh: n.mesh !== undefined, light: n.extensions?.KHR_lights_punctual?.light }));
const lightsDef = gltf.extensions?.KHR_lights_punctual?.lights || [];
const lights = named
  .filter((n) => n.light !== undefined)
  .map((n) => ({ node: n.name, ...lightsDef[n.light] }));

const animations = (gltf.animations || []).map((a) => {
  const targets = new Set();
  let duration = 0;
  for (const ch of a.channels) {
    const node = nodes[ch.target.node]?.name ?? `#${ch.target.node}`;
    targets.add(`${node}.${ch.target.path}`);
  }
  for (const s of a.samplers) {
    const acc = gltf.accessors[s.input];
    if (acc?.max) duration = Math.max(duration, acc.max[0]);
  }
  return { name: a.name, channels: a.channels.length, duration: +duration.toFixed(3), targets: [...targets] };
});

const materials = (gltf.materials || []).map((m) => ({
  name: m.name,
  emissive: m.emissiveFactor,
  emissiveStrength: m.extensions?.KHR_materials_emissive_strength?.emissiveStrength,
  alphaMode: m.alphaMode || "OPAQUE",
}));

const missing = expected.filter((n) => !named.some((x) => x.name === n));
const report = {
  file,
  nodes: named.length,
  meshes: (gltf.meshes || []).length,
  extensionsUsed: gltf.extensionsUsed || [],
  lights,
  animations,
  materials,
  missing,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`${file}: ${report.nodes} nodes, ${report.meshes} meshes, extensions: ${report.extensionsUsed.join(", ") || "none"}`);
  console.log(`\nlights (${lights.length}):`);
  for (const l of lights) console.log(`  ${l.node.padEnd(16)} ${l.type.padEnd(12)} intensity=${l.intensity ?? "-"} color=${JSON.stringify(l.color ?? [1, 1, 1])}${l.spot ? ` spot.outer=${l.spot.outerConeAngle?.toFixed(3)}` : ""}`);
  console.log(`\nanimations (${animations.length}):`);
  for (const a of animations) console.log(`  ${a.name.padEnd(18)} ${String(a.duration).padStart(6)} s  ${a.targets.join(" ")}`);
  console.log(`\nmaterials (${materials.length}):`);
  for (const m of materials) console.log(`  ${m.name}${m.emissive ? `  emissive=${JSON.stringify(m.emissive)}` : ""}${m.alphaMode !== "OPAQUE" ? `  ${m.alphaMode}` : ""}`);
  const rigNames = named.filter((n) => /^(Door_|Wheel_|Steer_|Light_)/.test(n.name)).map((n) => n.name);
  console.log(`\nrig-looking nodes: ${rigNames.join(", ") || "none"}`);
  if (expected.length) console.log(missing.length ? `\nMISSING: ${missing.join(", ")}` : `\nall ${expected.length} expected nodes present`);
}
process.exit(missing.length ? 1 : 0);

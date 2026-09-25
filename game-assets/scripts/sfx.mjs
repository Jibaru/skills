#!/usr/bin/env node
/**
 * sfx.mjs — synthesize retro sound effects as 16-bit mono WAV, sfxr-style.
 *
 * Dependency-free. Deterministic: the same preset and seed always produce
 * byte-identical files, so a rerun leaves a clean git diff.
 *
 *   node scripts/sfx.mjs jump --out assets/audio
 *   node scripts/sfx.mjs coin laser explosion --variants 3 --out assets/audio
 *   node scripts/sfx.mjs all --out assets/audio
 */

import fs from "node:fs";
import path from "node:path";

const RATE = 44100;

const USAGE = `
sfx — procedural retro sound effects (WAV)

Usage: node scripts/sfx.mjs <preset...|all> [options]

Presets: ${"coin jump laser explosion hit powerup blip select hurt pickup step death"}

Options:
  --out <dir>        output directory              (default assets/audio)
  --variants <n>     variations per preset         (default 1)
  --seed <n>         base seed                     (default 1)
  --volume <0..1>    master volume                 (default 0.5)
`;

// ---------------------------------------------------------------- rng

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- presets
// Each preset maps an rng to synth params:
//   wave: square | saw | sine | noise | triangle
//   freq (Hz) start, slide (Hz/s), dslide (Hz/s^2)
//   attack, sustain, decay (s), punch (0..1 extra level during sustain)
//   duty (square), vibrato {depth (0..1), speed (Hz)}
//   arp {at (s), mult}   one-shot pitch jump
//   lowpass (Hz)

const r = (rng, lo, hi) => lo + rng() * (hi - lo);

const PRESETS = {
  coin: (g) => ({ wave: "square", freq: r(g, 900, 1300), attack: 0, sustain: r(g, 0.03, 0.06), decay: r(g, 0.15, 0.3), punch: 0.4, duty: 0.5, arp: { at: r(g, 0.04, 0.08), mult: r(g, 1.3, 1.6) } }),
  pickup: (g) => ({ wave: "sine", freq: r(g, 600, 900), slide: r(g, 1500, 3000), attack: 0, sustain: 0.05, decay: r(g, 0.1, 0.2), punch: 0.3 }),
  jump: (g) => ({ wave: "square", freq: r(g, 250, 400), slide: r(g, 900, 1800), attack: 0, sustain: r(g, 0.05, 0.1), decay: r(g, 0.1, 0.2), duty: r(g, 0.2, 0.5) }),
  laser: (g) => ({ wave: g() < 0.5 ? "saw" : "square", freq: r(g, 1200, 2200), slide: -r(g, 4000, 9000), attack: 0, sustain: r(g, 0.05, 0.12), decay: r(g, 0.05, 0.15), duty: r(g, 0.1, 0.4) }),
  explosion: (g) => ({ wave: "noise", freq: r(g, 60, 140), slide: -r(g, 40, 100), attack: 0, sustain: r(g, 0.1, 0.25), decay: r(g, 0.4, 0.8), punch: 0.6, lowpass: r(g, 1500, 4000) }),
  hit: (g) => ({ wave: g() < 0.5 ? "noise" : "square", freq: r(g, 200, 500), slide: -r(g, 800, 2000), attack: 0, sustain: r(g, 0.02, 0.05), decay: r(g, 0.08, 0.18), punch: 0.5, lowpass: 5000 }),
  hurt: (g) => ({ wave: "saw", freq: r(g, 300, 500), slide: -r(g, 600, 1200), attack: 0, sustain: r(g, 0.05, 0.1), decay: r(g, 0.1, 0.25), vibrato: { depth: 0.2, speed: r(g, 20, 35) } }),
  powerup: (g) => ({ wave: g() < 0.5 ? "square" : "triangle", freq: r(g, 300, 500), slide: r(g, 600, 1200), attack: 0, sustain: r(g, 0.15, 0.3), decay: r(g, 0.2, 0.4), vibrato: { depth: r(g, 0.05, 0.15), speed: r(g, 10, 20) }, duty: 0.4 }),
  blip: (g) => ({ wave: "square", freq: r(g, 700, 1100), attack: 0, sustain: r(g, 0.02, 0.05), decay: r(g, 0.02, 0.06), duty: 0.5 }),
  select: (g) => ({ wave: "triangle", freq: r(g, 500, 800), attack: 0, sustain: 0.04, decay: 0.08, arp: { at: 0.04, mult: r(g, 1.25, 1.5) } }),
  step: (g) => ({ wave: "noise", freq: r(g, 100, 200), attack: 0, sustain: 0.01, decay: r(g, 0.04, 0.08), lowpass: r(g, 800, 1600) }),
  death: (g) => ({ wave: "square", freq: r(g, 400, 600), slide: -r(g, 300, 500), dslide: 0, attack: 0, sustain: r(g, 0.3, 0.5), decay: r(g, 0.4, 0.7), duty: 0.5, vibrato: { depth: 0.15, speed: r(g, 6, 10) } }),
};

// ---------------------------------------------------------------- synth

function synth(p, seed, volume) {
  const noise = mulberry32(seed ^ 0x9e3779b9);
  const total = p.attack + p.sustain + p.decay;
  const n = Math.ceil(total * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  let freq = p.freq;
  let slide = p.slide || 0;
  let noiseVal = 0;
  let lp = 0;
  const lpAlpha = p.lowpass ? 1 - Math.exp((-2 * Math.PI * p.lowpass) / RATE) : 1;
  let arped = false;

  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    if (p.arp && !arped && t >= p.arp.at) { freq *= p.arp.mult; arped = true; }
    slide += (p.dslide || 0) / RATE;
    freq = Math.max(20, freq + slide / RATE);
    let f = freq;
    if (p.vibrato) f *= 1 + p.vibrato.depth * Math.sin(2 * Math.PI * p.vibrato.speed * t);

    const prev = phase;
    phase = (phase + f / RATE) % 1;
    let s;
    switch (p.wave) {
      case "square": s = phase < (p.duty ?? 0.5) ? 1 : -1; break;
      case "saw": s = 2 * phase - 1; break;
      case "triangle": s = 1 - 4 * Math.abs(phase - 0.5); break;
      case "sine": s = Math.sin(2 * Math.PI * phase); break;
      case "noise":
        if (phase < prev) noiseVal = noise() * 2 - 1; // new random value each cycle
        s = noiseVal;
        break;
    }

    lp += lpAlpha * (s - lp);
    s = lp;

    let env;
    if (t < p.attack) env = t / p.attack;
    else if (t < p.attack + p.sustain) env = 1 + (p.punch || 0) * (1 - (t - p.attack) / p.sustain);
    else env = 1 - (t - p.attack - p.sustain) / p.decay;
    out[i] = s * Math.max(0, env) * volume;
  }
  // 5 ms fade-out so no file ends on a click
  const fade = Math.min(n, Math.floor(0.005 * RATE));
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  return out;
}

function wav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
const opts = { out: "assets/audio", variants: 1, seed: 1, volume: 0.5 };
const names = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--out") opts.out = args[++i];
  else if (a === "--variants") opts.variants = Number(args[++i]);
  else if (a === "--seed") opts.seed = Number(args[++i]);
  else if (a === "--volume") opts.volume = Number(args[++i]);
  else if (a === "-h" || a === "--help") { console.log(USAGE.trim()); process.exit(0); }
  else names.push(a);
}
if (!names.length) { console.log(USAGE.trim()); process.exit(1); }
const list = names.includes("all") ? Object.keys(PRESETS) : names;
for (const name of list) {
  if (!PRESETS[name]) { console.error(`sfx: unknown preset ${name}`); process.exit(1); }
}

fs.mkdirSync(opts.out, { recursive: true });
for (const name of list) {
  for (let v = 0; v < opts.variants; v++) {
    const seed = opts.seed * 1000 + v;
    const params = PRESETS[name](mulberry32(seed));
    const file = path.join(opts.out, opts.variants > 1 ? `${name}_${v + 1}.wav` : `${name}.wav`);
    fs.writeFileSync(file, wav(synth(params, seed, opts.volume)));
    console.log(file.split(path.sep).join("/"));
  }
}

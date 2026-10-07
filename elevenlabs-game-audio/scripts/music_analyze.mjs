#!/usr/bin/env node
/**
 * music_analyze.mjs — numbers for audio you cannot hear.
 *
 *   node music_analyze.mjs pulse raw/dread_bed.mp3 [--from 5 --to 60]   # loop-length candidates
 *   node music_analyze.mjs check out/dread_bed.ogg [--loop]              # loudness, peak, silence, seam
 *
 * pulse: autocorrelation of the onset envelope of the low end (lowpass 150 Hz). The top lags
 * are candidate beat/bar periods; make a loop's length a whole multiple of one of them.
 *
 * check: integrated LUFS, true peak, leading/trailing silence, and an RMS envelope in 2 s
 * windows. With --loop it compares the level of the last and first 2 s: a jump of more than
 * ~3 dB is an audible seam even when the crossfade itself is clean.
 */
import { execFileSync } from "node:child_process";
import { die, duration, loudness, parseArgs } from "./lib.mjs";

const opts = parseArgs(process.argv.slice(2), ["help", "loop"]);
const [cmd, file] = opts._;
if (opts.help || !cmd || !file) {
  console.log("usage: node music_analyze.mjs <pulse|check> <file> [--from s --to s] [--loop]");
  process.exit(opts.help ? 0 : 1);
}

/** Mono float32 samples at `rate` Hz, optional low-pass. */
function samples(f, rate, lowpass) {
  const af = [lowpass ? `lowpass=f=${lowpass}` : null, `aresample=${rate}`].filter(Boolean).join(",");
  const args = ["-v", "error"];
  if (opts.from) args.push("-ss", String(opts.from));
  if (opts.to) args.push("-to", String(opts.to));
  args.push("-i", f, "-af", af, "-ac", "1", "-f", "f32le", "-");
  const raw = execFileSync("ffmpeg", args, { maxBuffer: 1 << 30 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
}

function rmsWindows(x, rate, seconds) {
  const n = Math.round(rate * seconds);
  const out = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let s = 0;
    for (let j = 0; j < n; j++) s += x[i + j] ** 2;
    out.push(20 * Math.log10(Math.sqrt(s / n) + 1e-9));
  }
  return out;
}

if (cmd === "pulse") {
  const SR = 1000; // envelope rate: 1 ms resolution
  const x = samples(file, 8000, 150);
  const hop = 8000 / SR;
  // RMS over an 80 ms window, sliding by 1 ms. A shorter window tracks the waveform, or the
  // beating between two low drones (55 Hz + 82 Hz beat at 27 Hz and repeat exactly every 1 s),
  // instead of loudness, and that ripple then outscores the real onsets.
  const win = 640;
  const env = [];
  let acc = 0;
  for (let i = 0; i < Math.min(win, x.length); i++) acc += x[i] ** 2;
  for (let i = 0; i + win + hop <= x.length; i += hop) {
    env.push(Math.sqrt(acc / win));
    for (let j = 0; j < hop; j++) acc += x[i + win + j] ** 2 - x[i + j] ** 2;
  }
  // Onsets only: the rise over 10 ms, so slow swells and residual ripple count for little.
  const d = env.map((v, i) => Math.max(0, v - (env[i - 10] ?? v)));
  const m = d.reduce((a, b) => a + b, 0) / d.length;
  const minLag = Number(opts["min-lag"] || 300);
  const scored = [];
  for (let lag = minLag; lag <= Math.min(8000, d.length - 1); lag++) {
    let s = 0;
    for (let i = 0; i + lag < d.length; i++) s += (d[i] - m) * (d[i + lag] - m);
    scored.push([lag, s / (d.length - lag)]);
  }
  // Multiples of the true period score almost as high as the period itself, so the raw top of
  // the list can be 2x or 4x the beat. The base period is the shortest lag within 10% of the best.
  const best = Math.max(...scored.map(([, s]) => s));
  if (!(best > 0)) die("no periodic onsets found (beatless drone?) — pick the loop length by ear or by phrase");
  const base = scored.find(([, s]) => s >= best * 0.9);
  scored.sort((a, b) => b[1] - a[1]);
  console.log(`base period: ${(base[0] / SR).toFixed(3)} s`);
  console.log("top periods (s):", scored.slice(0, 8).map(([l]) => (l / SR).toFixed(3)).join("  "));
  console.log("loop length = a whole multiple of one period that fits the material (e.g. 17 × 6.05 s)");
} else if (cmd === "check") {
  const L = loudness(file);
  const total = duration(file);
  const rate = 8000;
  const x = samples(file, rate);
  const win = rmsWindows(x, rate, 2);
  const silent = (db) => db < -60;
  let lead = 0;
  while (lead < win.length && silent(win[lead])) lead++;
  let trail = 0;
  while (trail < win.length && silent(win[win.length - 1 - trail])) trail++;
  console.log(`${file}`);
  console.log(`  length ${total.toFixed(2)} s   loudness ${L.lufs} LUFS   true peak ${L.truePeak} dBTP   LRA ${L.lra}`);
  if (L.truePeak > -0.5) console.log("  ! true peak above -0.5 dBTP: normalize before shipping");
  if (lead) console.log(`  ! ~${lead * 2} s of leading silence`);
  if (trail) console.log(`  ! ~${trail * 2} s of trailing silence (trim it, or the loop has a gap)`);
  console.log(`  RMS per 2 s: ${win.map((v) => v.toFixed(0)).join(" ")}`);
  if (opts.loop && win.length >= 2) {
    const jump = Math.abs(win[win.length - 1] - win[0]);
    console.log(`  seam: last ${win[win.length - 1].toFixed(1)} dB vs first ${win[0].toFixed(1)} dB → ${jump.toFixed(1)} dB jump${jump > 3 ? "  ! audible seam likely" : ""}`);
  }
} else die(`unknown command ${cmd}`);

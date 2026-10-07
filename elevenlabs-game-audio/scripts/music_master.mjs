#!/usr/bin/env node
/**
 * music_master.mjs — turn raw generated music into game-ready OGG Vorbis: loudness-normalized,
 * trimmed, seamless loops, and stingers split out of one long file.
 *
 *   node music_master.mjs normalize raw/main_theme.mp3 out/main_theme.ogg --lufs -20 [--to 90 --fade-out 6]
 *   node music_master.mjs loop raw/dread_bed.mp3 out/dread_bed.ogg --start 5 --length 102.85 --xfade 5 --lufs -20
 *   node music_master.mjs cut raw/stingers.mp3 out/sting_slam.ogg --from 0 --to 5.5 --fade-in 0.01 --fade-out 1.8 --lufs -18
 *   node music_master.mjs split raw/stingers.mp3 out/ --prefix sting_ --lufs -18 [--noise -45 --min-silence 1.2]
 *
 * Why each step exists (measured on generated cues):
 * - Generated music comes out hot (-11 to -15 LUFS, true peaks up to +1 dBFS) and often ends in
 *   silence (one 125 s bed went silent after 122 s). Normalize everything with a two-pass,
 *   linear loudnorm: pass 1 measures, pass 2 applies one gain, so dynamics are not pumped.
 * - A loop's length should be a whole number of pulses (measure with music_analyze.mjs pulse),
 *   and its seam is an equal-power crossfade (afade curve=qsin) of the tail over the head.
 * - Asking for "stingers separated by two seconds of silence" works; split them on silence.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { die, ff, loudness, parseArgs } from "./lib.mjs";

const opts = parseArgs(process.argv.slice(2), ["help", "keep-wav"]);
const [cmd, src, dst] = opts._;
const num = (k, d) => (opts[k] === undefined ? d : Number(opts[k]));
if (opts.help || !cmd || !src || !dst) {
  console.log("usage: node music_master.mjs <normalize|loop|cut|split> <in> <out> [options] (see header)");
  process.exit(opts.help ? 0 : 1);
}
if (!fs.existsSync(src)) die(`no such file ${src}`);
const LUFS = num("lufs", -20);
const TP = num("tp", -1);

const tmpDir = path.join(path.dirname(dst.endsWith("/") || dst.endsWith("\\") ? path.join(dst, "x") : dst), ".master_tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const tmp = (name) => path.join(tmpDir, `${name}.wav`);

/** Two-pass linear loudnorm to OGG Vorbis q5. */
function normalize(input, output, I = LUFS, tp = TP) {
  const m = loudness(input);
  const af =
    `loudnorm=I=${I}:TP=${tp}:LRA=20:measured_I=${m.lufs}:measured_TP=${m.truePeak}` +
    `:measured_LRA=${m.lra}:measured_thresh=${m.thresh}:offset=${m.offset}:linear=true,aresample=44100`;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  ff(["-i", input, "-af", af, "-ar", "44100", "-c:a", "libvorbis", "-q:a", "5", output]);
  const after = loudness(output);
  console.log(`${output}  ${m.lufs} → ${after.lufs} LUFS, peak ${after.truePeak} dBTP`);
}

/** L seconds from `start`; the first X seconds are an equal-power mix with the tail [start+L, start+L+X]. */
function loop(input, start, L, X) {
  const out = tmp(path.basename(dst, path.extname(dst)) + "_loop");
  const fc = [
    `[0:a]atrim=${start}:${start + L + X},asetpts=PTS-STARTPTS,asplit=3[a][b][c]`,
    `[a]atrim=0:${X},asetpts=PTS-STARTPTS,afade=t=in:d=${X}:curve=qsin[head]`,
    `[b]atrim=${L}:${L + X},asetpts=PTS-STARTPTS,afade=t=out:d=${X}:curve=qsin[tail]`,
    `[head][tail]amix=inputs=2:normalize=0[xf]`,
    `[c]atrim=${X}:${L},asetpts=PTS-STARTPTS[body]`,
    `[xf][body]concat=n=2:v=0:a=1[out]`,
  ].join(";");
  ff(["-i", input, "-filter_complex", fc, "-map", "[out]", "-ar", "44100", "-c:a", "pcm_s16le", out]);
  return out;
}

function cut(input, from, to, fadeIn, fadeOut, name) {
  const out = tmp(name);
  const d = to - from;
  const af = [fadeIn > 0 ? `afade=t=in:d=${fadeIn}` : null, fadeOut > 0 ? `afade=t=out:st=${Math.max(0, d - fadeOut)}:d=${fadeOut}:curve=qsin` : null]
    .filter(Boolean)
    .join(",") || "anull";
  ff(["-ss", String(from), "-to", String(to), "-i", input, "-af", af, "-ar", "44100", "-c:a", "pcm_s16le", out]);
  return out;
}

/** Non-silent regions via silencedetect. */
function regions(input, noiseDb, minSilence) {
  const p = spawnSync("ffmpeg", ["-hide_banner", "-i", input, "-af", `silencedetect=n=${noiseDb}dB:d=${minSilence}`, "-f", "null", "-"], { encoding: "utf8" });
  const starts = [...p.stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...p.stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const total = Number((p.stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/) || []).slice(1).reduce((a, v, i) => a + Number(v) * [3600, 60, 1][i], 0));
  const out = [];
  let cursor = 0;
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] - cursor > 0.25) out.push([cursor, starts[i]]);
    cursor = ends[i] ?? total;
  }
  if (total - cursor > 0.25) out.push([cursor, total]);
  return out;
}

if (cmd === "normalize") {
  const to = opts.to === undefined ? null : Number(opts.to);
  const input = to !== null || opts["fade-out"] ? cut(src, num("from", 0), to ?? 1e9, num("fade-in", 0), num("fade-out", 0), path.basename(dst, path.extname(dst))) : src;
  normalize(input, dst);
} else if (cmd === "loop") {
  for (const k of ["start", "length", "xfade"]) if (opts[k] === undefined) die(`loop needs --${k}`);
  normalize(loop(src, num("start"), num("length"), num("xfade")), dst);
} else if (cmd === "cut") {
  if (opts.from === undefined || opts.to === undefined) die("cut needs --from and --to");
  normalize(cut(src, num("from"), num("to"), num("fade-in", 0.01), num("fade-out", 1.5), path.basename(dst, path.extname(dst))), dst);
} else if (cmd === "split") {
  const parts = regions(src, num("noise", -45), num("min-silence", 1.2));
  if (!parts.length) die("no non-silent regions found; lower --noise (e.g. -55) or --min-silence");
  fs.mkdirSync(dst, { recursive: true });
  parts.forEach(([a, b], i) => {
    const name = `${opts.prefix || "part_"}${String(i + 1).padStart(2, "0")}`;
    console.log(`region ${i + 1}: ${a.toFixed(2)}–${b.toFixed(2)} s`);
    normalize(cut(src, Math.max(0, a - 0.02), b + 0.3, 0.01, 0.3, name), path.join(dst, `${name}.ogg`));
  });
  console.log(`${parts.length} part(s). Listen and rename them (sting_slam, sting_swell, …).`);
} else die(`unknown command ${cmd}`);

if (!opts["keep-wav"]) fs.rmSync(tmpDir, { recursive: true, force: true });

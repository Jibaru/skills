#!/usr/bin/env node
/**
 * voices.mjs — generate voice lines with ElevenLabs TTS from a JSON spec, cache the raw MP3,
 * apply a per-source "diegetic" FX chain with ffmpeg, and write mono Vorbis files.
 *
 *   node voices.mjs --spec voice_lines.json --dry          # validate + count characters, no API call
 *   node voices.mjs --spec voice_lines.json                # generate what is missing
 *   node voices.mjs --spec voice_lines.json --only INTRO_1,INTRO_2 --force
 *   node voices.mjs --spec voice_lines.json --fx-only      # re-apply FX from cache: costs nothing
 *   node voices.mjs --spec voice_lines.json --verify       # duration + loudness of every output
 *
 * The raw MP3 per line is cached (default assets/source/voice_raw/, gitignore it): re-processing
 * FX never re-bills. `--force` regenerates selected lines; combine with `--only`.
 */
import fs from "node:fs";
import path from "node:path";
import { apiKey, die, duration, ff, parseArgs, postForAudio, volume } from "./lib.mjs";

/**
 * FX chains per source, proven in a shipped game. Override or add in the spec's "fx" map.
 * Every chain ends in loudnorm so lines from different voices sit at the same level.
 */
export const FX = {
  clean: "loudnorm=I=-18:TP=-2",
  narration: "aecho=0.8:0.4:60:0.08,loudnorm=I=-18:TP=-2",
  tape: "highpass=f=180,lowpass=f=4200,vibrato=f=0.6:d=0.12,acompressor,aecho=0.6:0.3:25:0.1,loudnorm=I=-20:TP=-3",
  radio: "highpass=f=450,lowpass=f=2800,acrusher=bits=10:mix=0.25,acompressor=threshold=-20dB:ratio=6,loudnorm=I=-19:TP=-3",
  phone: "highpass=f=350,lowpass=f=3200,acompressor,loudnorm=I=-20:TP=-3",
  tv: "highpass=f=120,lowpass=f=6000,aecho=0.7:0.3:18:0.15,loudnorm=I=-20:TP=-3",
  door: "lowpass=f=1600,aecho=0.7:0.5:30|60:0.25|0.1,loudnorm=I=-21:TP=-3",
  // "Something imitating a person": slightly lower pitch, slightly fast, short double echo.
  mimic: "asetrate=44100*0.94,aresample=44100,atempo=1.04,lowpass=f=1500,aecho=0.8:0.6:14|28:0.35|0.25,loudnorm=I=-21:TP=-3",
};

const DEFAULT_SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true };

const opts = parseArgs(process.argv.slice(2), ["dry", "force", "fx-only", "verify", "help"]);
if (opts.help || !opts.spec) {
  console.log("usage: node voices.mjs --spec <file.json> [--dry] [--only K1,K2] [--force] [--fx-only] [--verify] [--raw dir] [--out dir]");
  process.exit(opts.help ? 0 : 1);
}

const spec = JSON.parse(fs.readFileSync(opts.spec, "utf8"));
const fx = { ...FX, ...(spec.fx || {}) };
const RAW = opts.raw || spec.raw || "assets/source/voice_raw";
const OUT = opts.out || spec.out || "assets/audio/voice";
const MODEL = spec.model || "eleven_multilingual_v2";
const TEXT_FIELD = spec.text_field || "text";
const only = opts.only ? new Set(opts.only.split(",")) : null;

// ---------------------------------------------------------------- validation

const problems = [];
for (const [who, c] of Object.entries(spec.cast || {})) {
  if (!c.voice) problems.push(`cast.${who}: missing "voice" (voice_id)`);
  if (c.fx && !fx[c.fx]) problems.push(`cast.${who}: unknown fx "${c.fx}"`);
}
for (const [key, line] of Object.entries(spec.lines || {})) {
  if (!spec.cast?.[line.who]) problems.push(`lines.${key}: unknown speaker "${line.who}"`);
  if (!line[TEXT_FIELD]) problems.push(`lines.${key}: missing "${TEXT_FIELD}"`);
  if (line.fx && !fx[line.fx]) problems.push(`lines.${key}: unknown fx "${line.fx}"`);
}
if (only) for (const k of only) if (!spec.lines?.[k]) problems.push(`--only: no line "${k}"`);
if (problems.length) die(`spec problems:\n  ${problems.join("\n  ")}`);

const selected = Object.entries(spec.lines).filter(([k]) => !only || only.has(k));
const outFile = (key, line) => path.join(line.out || spec.cast[line.who].out || OUT, `${key}.ogg`);
const rawFile = (key) => path.join(RAW, `${key}.mp3`);

// ---------------------------------------------------------------- dry run

if (opts.dry) {
  let chars = 0;
  let pending = 0;
  for (const [key, line] of selected) {
    const needsApi = opts.force || !fs.existsSync(rawFile(key));
    if (needsApi) {
      chars += [...line[TEXT_FIELD]].length;
      pending++;
    }
  }
  console.log(`spec ok: ${Object.keys(spec.cast).length} voices, ${selected.length} line(s) selected`);
  console.log(`would call TTS for ${pending} line(s), ${chars} characters (billed by characters)`);
  process.exit(0);
}

// ---------------------------------------------------------------- verify

if (opts.verify) {
  let flagged = 0;
  for (const [key, line] of selected) {
    const f = outFile(key, line);
    if (!fs.existsSync(f)) {
      console.log(`MISSING ${key}`);
      flagged++;
      continue;
    }
    const d = duration(f);
    const v = volume(f);
    // Deliberately lenient floor (0.04 s per character; real speech runs ~0.06 s/char in
    // English and ~0.12 s/char in Japanese). Anything below it is a truncated or empty take.
    const short = d < Math.max(0.6, [...line[TEXT_FIELD]].length * 0.04);
    const quiet = v.mean < -40;
    const flag = short ? "  ← suspiciously short" : quiet ? "  ← very quiet" : "";
    if (flag) flagged++;
    console.log(`${key.padEnd(18)} ${d.toFixed(2).padStart(6)} s  mean ${v.mean.toFixed(1)} dB  max ${v.max.toFixed(1)} dB${flag}`);
  }
  console.log(flagged ? `\n${flagged} line(s) to listen to first` : "\nall lines in range (still listen before shipping)");
  process.exit(flagged ? 1 : 0);
}

// ---------------------------------------------------------------- generate

const KEY = opts["fx-only"] ? null : apiKey();
fs.mkdirSync(RAW, { recursive: true });

let chars = 0;
let failed = 0;
for (const [key, line] of selected) {
  const cast = spec.cast[line.who];
  const out = outFile(key, line);
  const raw = rawFile(key);
  if (fs.existsSync(out) && !opts.force && !opts["fx-only"]) continue;
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    if (!opts["fx-only"] && (opts.force || !fs.existsSync(raw))) {
      const body = {
        text: line[TEXT_FIELD],
        model_id: MODEL,
        voice_settings: { ...DEFAULT_SETTINGS, ...(spec.settings || {}), ...(cast.settings || {}), ...(line.settings || {}) },
      };
      if (spec.language_code) body.language_code = spec.language_code;
      fs.writeFileSync(raw, await postForAudio(`/v1/text-to-speech/${cast.voice}?output_format=mp3_44100_128`, body, KEY));
      chars += [...line[TEXT_FIELD]].length;
    }
    if (!fs.existsSync(raw)) throw new Error(`no cached raw ${raw} (run without --fx-only)`);
    ff(["-i", raw, "-af", fx[line.fx || cast.fx || "clean"], "-ac", "1", "-c:a", "libvorbis", "-q:a", "5", out]);
    console.log(`OK   ${key} (${line.who})`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${key}: ${e.message}`);
  }
}
console.log(`characters sent: ${chars}${failed ? `, ${failed} failure(s)` : ""}`);
process.exit(failed ? 1 : 0);

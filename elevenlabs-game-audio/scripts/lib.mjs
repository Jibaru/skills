/**
 * Shared helpers for the elevenlabs-game-audio scripts.
 *
 * Dependency-free (Node 18+). The API key is read from the environment or a `.env` in the
 * working directory, never from an argument: arguments end up in shell history and transcripts.
 */
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

export const API = "https://api.elevenlabs.io";

/**
 * Parse `.env` with indexOf, not split("="): API keys and URLs can contain "=" and a split
 * silently truncates them.
 */
export function readEnvFile(file = ".env") {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, i).trim()] = value;
  }
  return out;
}

export function apiKey() {
  const key = process.env.ELEVENLABS_API_KEY || readEnvFile().ELEVENLABS_API_KEY;
  if (!key) die("ELEVENLABS_API_KEY is not set (environment or .env). Never pass it as an argument.");
  return key;
}

/** JSON headers. `charset=utf-8` matters: non-ASCII text (Japanese) must arrive intact. */
export function headers(key) {
  return { "xi-api-key": key, "Content-Type": "application/json; charset=utf-8" };
}

/** POST JSON, return the raw body as a Buffer. Throws with the API's own error text. */
export async function postForAudio(path, body, key) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
  if (!r.ok) throw new ApiError(r.status, (await r.text()).slice(0, 500));
  return Buffer.from(await r.arrayBuffer());
}

export async function postJson(path, body, key) {
  const r = await fetch(`${API}${path}`, { method: "POST", headers: headers(key), body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new ApiError(r.status, text.slice(0, 500));
  return JSON.parse(text);
}

export class ApiError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
  get concurrencyLimited() {
    return this.status === 429 && /concurrent/i.test(this.body);
  }
}

/**
 * Run tasks with at most `limit` in flight. Music allows 2 concurrent requests; a third returns
 * 429 concurrent_limit_exceeded, so the queue, not the caller, enforces it.
 */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- ffmpeg

export function ff(args) {
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args], { stdio: ["ignore", "inherit", "inherit"] });
}

/** Duration in seconds. `tr -d ',\r'` equivalent: Windows ffprobe can append "," and CR. */
export function duration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  return Number(out.replace(/[,\r\n\s]/g, ""));
}

/**
 * Integrated loudness and true peak via loudnorm's first pass. The JSON block is mixed into
 * stderr with other output, so it is matched, not parsed whole.
 */
export function loudness(file) {
  const p = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "loudnorm=print_format=json", "-f", "null", "-"], { encoding: "utf8" });
  const m = p.stderr.match(/{[^{}]*"input_i"[^{}]*}/);
  if (!m) throw new Error(`loudnorm produced no measurement for ${file}`);
  const j = JSON.parse(m[0]);
  return { lufs: Number(j.input_i), truePeak: Number(j.input_tp), lra: Number(j.input_lra), thresh: Number(j.input_thresh), offset: Number(j.target_offset) };
}

/** Mean and max volume in dB (volumedetect). */
export function volume(file) {
  const p = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const mean = p.stderr.match(/mean_volume:\s*(-?[\d.]+|-inf)/);
  const max = p.stderr.match(/max_volume:\s*(-?[\d.]+|-inf)/);
  const num = (m) => (m ? (m[1] === "-inf" ? -Infinity : Number(m[1])) : NaN);
  return { mean: num(mean), max: num(max) };
}

export function die(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

/** Minimal flag parser: --key value, --flag, and positional args. */
export function parseArgs(argv, booleans = []) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      if (booleans.includes(k)) opts[k] = true;
      else opts[k] = argv[++i];
    } else opts._.push(a);
  }
  return opts;
}

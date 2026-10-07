#!/usr/bin/env node
/**
 * music_gen.mjs — generate instrumental music cues with the ElevenLabs Music API from a JSON
 * cue sheet, at most 2 requests in flight.
 *
 *   node music_gen.mjs --cues music_cues.json --dry          # print prompts + total length, no API call
 *   node music_gen.mjs --cues music_cues.json                # generate cues missing from --out
 *   node music_gen.mjs --cues music_cues.json dread_bed tension --force
 *
 * Raw MP3s go to assets/source/music_raw/ (gitignore it); master them with music_master.mjs.
 *
 * Why a concurrency-2 queue: a third simultaneous request returned 429 concurrent_limit_exceeded
 * on the plan this was built with (the limit is per plan and not documented in the API reference).
 * The queue keeps 2 in flight and retries a concurrency 429 after a pause instead of failing the
 * batch; raise --concurrency only if your plan allows more.
 *
 * Every prompt is prefixed with the sheet's "style" string so cues sound like one score.
 * Timestamped structure in a prompt ("0-13s piano, 56-58s silence") is NOT followed: build
 * structured cues (trailer: build → silence → hit) by cutting and mixing in music_master.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { ApiError, apiKey, die, parseArgs, pool, postForAudio, sleep } from "./lib.mjs";

const opts = parseArgs(process.argv.slice(2), ["dry", "force", "help"]);
if (opts.help || !opts.cues) {
  console.log("usage: node music_gen.mjs --cues <file.json> [names...] [--dry] [--force] [--out dir] [--concurrency 2]");
  process.exit(opts.help ? 0 : 1);
}

const sheet = JSON.parse(fs.readFileSync(opts.cues, "utf8"));
const OUT = opts.out || sheet.out || "assets/source/music_raw";
const CONCURRENCY = Number(opts.concurrency || 2);
const names = opts._.length ? opts._ : Object.keys(sheet.cues);

for (const n of names) {
  const c = sheet.cues[n];
  if (!c) die(`no cue "${n}" in ${opts.cues}`);
  if (!(c.ms >= 3000 && c.ms <= 600000)) die(`cue "${n}": ms must be 3000-600000, got ${c.ms}`);
  if (!c.prompt) die(`cue "${n}": missing prompt`);
}

const promptOf = (c) => [sheet.style, c.prompt].filter(Boolean).join(" ");

if (opts.dry) {
  let total = 0;
  for (const n of names) {
    const c = sheet.cues[n];
    total += c.ms;
    console.log(`${n.padEnd(14)} ${(c.ms / 1000).toFixed(0).padStart(4)} s  ${promptOf(c).slice(0, 110)}…`);
  }
  console.log(`\n${names.length} cue(s), ${(total / 1000).toFixed(0)} s of music requested`);
  process.exit(0);
}

const KEY = apiKey();
fs.mkdirSync(OUT, { recursive: true });

const todo = names.filter((n) => opts.force || !fs.existsSync(path.join(OUT, `${n}.mp3`)));
let failed = 0;
await pool(todo, CONCURRENCY, async (n) => {
  const c = sheet.cues[n];
  const body = { prompt: promptOf(c), music_length_ms: c.ms, force_instrumental: c.instrumental !== false };
  if (sheet.model_id) body.model_id = sheet.model_id;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const buf = await postForAudio("/v1/music?output_format=mp3_44100_128", body, KEY);
      fs.writeFileSync(path.join(OUT, `${n}.mp3`), buf);
      console.log(`ok   ${n} (${buf.length} bytes)`);
      return;
    } catch (e) {
      if (e instanceof ApiError && e.concurrencyLimited && attempt < 4) {
        console.log(`wait ${n}: concurrency limit, retrying (${attempt}/3)`);
        await sleep(15000 * attempt);
        continue;
      }
      failed++;
      console.log(`FAIL ${n}: ${e.message}`);
      return;
    }
  }
});
console.log(failed ? `${failed} cue(s) failed` : `done: ${todo.length} generated, ${names.length - todo.length} cached`);
process.exit(failed ? 1 : 0);

#!/usr/bin/env node
/**
 * voice_design.mjs — design a voice from a description (ElevenLabs Voice Design), save ALL
 * previews for a human to pick, then save the chosen one to the account.
 *
 *   node voice_design.mjs design --name Grandma --description "An 82-year-old ..." --text-file sample.txt --out review/
 *   node voice_design.mjs save --name Grandma --description "..." --generated-id <id from design>
 *
 * Two steps on purpose. An agent cannot listen, so it must not pick: `design` writes the three
 * previews plus a JSON with their ids, durations and loudness, and stops. The user listens and
 * names the one to keep; `save` stores it. (A pipeline that auto-saved preview 0 shipped
 * whichever voice came first.)
 *
 * The sample text must be 100-1000 characters, or the API returns 422 string_too_short.
 */
import fs from "node:fs";
import path from "node:path";
import { apiKey, die, duration, parseArgs, postJson, volume } from "./lib.mjs";

const opts = parseArgs(process.argv.slice(2), ["help"]);
const cmd = opts._[0];
if (opts.help || !["design", "save"].includes(cmd)) {
  console.log("usage:\n  node voice_design.mjs design --name N --description D (--text T | --text-file F) [--out dir] [--model eleven_multilingual_ttv_v2]\n  node voice_design.mjs save --name N --description D --generated-id ID");
  process.exit(opts.help ? 0 : 1);
}
if (!opts.name || !opts.description) die("--name and --description are required");

if (cmd === "design") {
  const text = opts["text-file"] ? fs.readFileSync(opts["text-file"], "utf8").trim() : opts.text;
  if (!text) die("--text or --text-file is required (the voice speaks it in the previews)");
  const n = [...text].length;
  if (n < 100 || n > 1000) die(`sample text is ${n} characters; Voice Design requires 100-1000`);

  const out = opts.out || ".";
  fs.mkdirSync(out, { recursive: true });
  const j = await postJson(
    "/v1/text-to-voice/design",
    { voice_description: opts.description, text, model_id: opts.model || "eleven_multilingual_ttv_v2" },
    apiKey(),
  );
  const previews = j.previews.map((p, i) => {
    const file = path.join(out, `${opts.name}_preview_${i}.mp3`);
    fs.writeFileSync(file, Buffer.from(p.audio_base_64, "base64"));
    const v = volume(file);
    return { index: i, file, generated_voice_id: p.generated_voice_id, seconds: Number(duration(file).toFixed(2)), mean_db: v.mean };
  });
  fs.writeFileSync(path.join(out, `${opts.name}_previews.json`), JSON.stringify({ name: opts.name, description: opts.description, previews }, null, 2) + "\n");
  for (const p of previews) console.log(`${p.index}  ${p.file}  ${p.seconds} s  mean ${p.mean_db} dB  id ${p.generated_voice_id}`);
  console.log("\nAsk the user to LISTEN to the previews and pick one, then run `save --generated-id <id>`.");
} else {
  if (!opts["generated-id"]) die("--generated-id is required (from the design step's JSON)");
  const j = await postJson(
    "/v1/text-to-voice",
    { voice_name: opts.name, voice_description: opts.description, generated_voice_id: opts["generated-id"] },
    apiKey(),
  );
  console.log(`saved voice_id ${j.voice_id}  (use it as "voice" in the voices spec)`);
}

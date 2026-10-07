#!/usr/bin/env node
/**
 * check_key.mjs — confirm the API key works, without spending credits.
 *
 *   node check_key.mjs
 *
 * Probes GET /v1/voices (lists voices; not billed). Not /v1/user: a key restricted to
 * generation permissions returns 401 missing_permissions ("user_read") there and on
 * /v1/user/subscription while TTS, Voice Design and Music work fine, so a /v1/user check
 * reports a working key as broken.
 */
import { API, apiKey } from "./lib.mjs";

const key = apiKey();
const r = await fetch(`${API}/v1/voices`, { headers: { "xi-api-key": key } });
const body = await r.text();
if (r.ok) {
  const n = (JSON.parse(body).voices || []).length;
  console.log(`ok: key accepted (${n} voice(s) in the account)`);
} else if (r.status === 401 && /missing_permissions/.test(body)) {
  console.log("restricted key: it lacks voices_read, but it may still generate. Try one short TTS line (costs a few characters).");
} else if (r.status === 401) {
  console.log(`invalid key: ${body.slice(0, 200)}`);
  process.exit(1);
} else {
  console.log(`HTTP ${r.status}: ${body.slice(0, 200)}`);
  process.exit(1);
}

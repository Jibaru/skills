#!/usr/bin/env node
/**
 * sketchfab.mjs — search wide, review on a numbered contact sheet, inspect, and download Sketchfab
 * models with licence checks. Node 18+, no deps; the sheet needs ffmpeg.
 *
 *   node scripts/sketchfab.mjs search "labrador" "german shepherd" --animated --out cands.json [--max-faces 80000] [--min-anims 2] [--pages 2] [--loose]
 *   node scripts/sketchfab.mjs sheet cands.json --top 12 --out review/     -> review/sheet.jpg + review/sheet.txt (numbered)
 *   node scripts/sketchfab.mjs info <uid>                                   -> licence, faces, anims, sizes, description flags
 *   node scripts/sketchfab.mjs get dog_lab=<uid> [more key=uid] [--dest assets/models] [--project .]
 *
 * Token: SKETCHFAB_API_TOKEN (env or ./.env), from https://sketchfab.com/settings/password.
 * search/sheet/info work without it but get rate-limited (HTTP 429) quickly; get needs it.
 *
 * Licence policy (public game / public repo): cc0, by, by-sa only. Skipped: free-st / st (Sketchfab
 * "Standard": no raw redistribution, which a public repo is), by-nc*, by-nd*, ed.
 *
 * `get` delegates to assets.mjs so credits land in the project's one credits record (same refuse-to-
 * shrink guard, licence version + URL, CREDITS.md rebuild).
 *
 * Based on the script written and live-tested in the THE ONES session (crafter-games/the-ones).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API = "https://api.sketchfab.com/v3";
const ALLOWED = ["cc0", "by", "by-sa"];
// Search results carry only the licence LABEL; the slug is only on /models/{uid}.
const LABEL_TO_SLUG = {
  "CC0 Public Domain": "cc0", "CC Attribution": "by", "CC Attribution-ShareAlike": "by-sa",
  "CC Attribution-NoDerivs": "by-nd", "CC Attribution-NonCommercial": "by-nc",
  "CC Attribution-NonCommercial-ShareAlike": "by-nc-sa", "CC Attribution-NonCommercial-NoDerivs": "by-nc-nd",
  "Free Standard": "free-st", "Standard": "st", "Editorial": "ed",
};
// Names that point at someone else's IP or a ripped game asset (a hint, not a verdict: look at it).
const IP_FLAGS = /paw patrol|pok[eé]mon|league of legends|fortnite|minecraft|roblox|poppy playtime|half[- ]?life|hl2|gmod|\bscp[- ]?\d|xenomorph|slender ?man|disney|marvel|nintendo|resident evil|silent hill|\brip(ped)?\b|\bport(ed)? from\b/i;
// Text in a description that voids or clouds an otherwise allowed licence.
const RED_FLAGS = /non[- ]?commercial|personal use only|not for commercial|ripped|extracted from|from the game|asset store|do not (re)?upload|fan ?art|meshy|tripo|ai[- ]generated/i;

function readEnv() {
  try {
    // indexOf, not split("="): tokens and URLs can contain "=".
    return Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  } catch { return {}; }
}
const TOKEN = process.env.SKETCHFAB_API_TOKEN || readEnv().SKETCHFAB_API_TOKEN;
// Send the token on every call: anonymous /models/{uid} calls hit HTTP 429 quickly.
const H = TOKEN ? { Authorization: `Token ${TOKEN}` } : {};

async function api(url, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url.startsWith("http") ? url : API + url, { headers: H });
    if (r.status === 429 && i < tries) { await new Promise((s) => setTimeout(s, 2000 * (i + 1))); continue; }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)} — ${url}`);
    return r.json();
  }
}

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      o[k] = v;
    } else o._.push(a);
  }
  return o;
}

function thumb(m, maxW = 1024) {
  const imgs = [...(m.thumbnails?.images || [])].sort((a, b) => b.width - a.width);
  return (imgs.find((i) => i.width <= maxW) || imgs[0])?.url;
}

// One request per (query, licence): the API honours a single `license=` value; repeating it keeps only the last.
async function search(queries, o) {
  if (!queries.length) throw new Error("search needs at least one query");
  if (!TOKEN) console.error("note: no SKETCHFAB_API_TOKEN — searching anonymously (rate limits come sooner)");
  const seen = new Map();
  for (const q of queries) {
    for (const lic of ALLOWED) {
      let url = `/search?type=models&downloadable=true&sort_by=-likeCount&count=24&license=${lic}&q=${encodeURIComponent(q)}`;
      if (o.animated) url += "&animated=true";
      if (o["max-faces"]) url += `&max_face_count=${o["max-faces"]}`;
      for (let page = 0; url && page < Number(o.pages || 2); page++) {
        const j = await api(url);
        for (const m of j.results || []) {
          if (seen.has(m.uid)) { seen.get(m.uid).queries.add(q); continue; }
          seen.set(m.uid, {
            uid: m.uid, name: m.name, author: m.user?.displayName || m.user?.username, username: m.user?.username,
            lic: LABEL_TO_SLUG[m.license?.label] || lic, likes: m.likeCount, faces: m.faceCount, anims: m.animationCount,
            glbMB: +((m.archives?.glb?.size || 0) / 1e6).toFixed(1), texMax: m.archives?.glb?.textureMaxResolution,
            tags: (m.tags || []).map((t) => t.name), cats: (m.categories || []).map((c) => c.name),
            flag: [RED_FLAGS.test(m.description || "") && "CHECK-DESCRIPTION", IP_FLAGS.test(m.name) && "IP?"].filter(Boolean).join(","),
            url: `https://sketchfab.com/3d-models/${m.uid}`, thumb: thumb(m), queries: new Set([q]),
          });
        }
        url = j.next;
      }
    }
  }
  let list = [...seen.values()].filter((m) => ALLOWED.includes(m.lic));
  if (o["min-anims"]) list = list.filter((m) => m.anims >= Number(o["min-anims"]));
  // Sorting by likes surfaces popular off-topic models ("dog" → arcade cabinets); require a query word in name/tags unless --loose.
  if (!o.loose) {
    const words = queries.flatMap((q) => q.toLowerCase().split(/\s+/)).filter((w) => w.length > 2);
    list = list.filter((m) => words.some((w) => [m.name, ...m.tags].join(" ").toLowerCase().includes(w)));
  }
  list.sort((a, b) => b.anims - a.anims || b.likes - a.likes);
  // Same face count + clip count under another author is usually a reupload: licence only the original.
  const firstBy = new Map();
  for (const m of [...list].sort((a, b) => b.likes - a.likes)) {
    const k = m.faces + "/" + m.anims;
    if (firstBy.has(k) && firstBy.get(k).username !== m.username) m.flag = [m.flag, "REUPLOAD-OF:" + firstBy.get(k).uid.slice(0, 8)].filter(Boolean).join(",");
    else if (!firstBy.has(k)) firstBy.set(k, m);
  }
  for (const m of list) console.log([m.uid, m.lic, `♥${m.likes}`, `${m.faces}f`, `anim=${m.anims}`, `${m.glbMB}MB`, m.flag, m.author, m.name].join(" | "));
  const out = o.out || "sketchfab_candidates.json";
  fs.writeFileSync(out, JSON.stringify(list.map((m) => ({ ...m, queries: [...m.queries] })), null, 1) + "\n");
  console.error(`${list.length} candidates -> ${out}`);
}

// Numbered contact sheet (4 columns) for the user to pick from by number.
async function sheet(file, o) {
  const list = JSON.parse(fs.readFileSync(file, "utf8")).slice(0, Number(o.top || 12));
  if (!list.length) throw new Error(`${file} has no candidates`);
  const dir = o.out || "review";
  fs.mkdirSync(dir, { recursive: true });
  // Windows ffmpeg has no fontconfig, so drawtext needs fontfile=, and a "C:" path breaks the filter's
  // ":" option parsing. Copy a font next to the images and run ffmpeg with cwd=dir so the path is "font.ttf".
  const font = ["C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f));
  if (font) fs.copyFileSync(font, path.join(dir, "font.ttf"));
  const tiles = [];
  const lines = [];
  for (const [i, m] of list.entries()) {
    const n = i + 1;
    const raw = path.join(dir, `t${n}.jpg`);
    if (!fs.existsSync(raw)) {
      const r = await fetch(m.thumb);
      if (!r.ok) throw new Error(`thumbnail ${r.status} for ${m.uid}`);
      fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
    }
    const label = font ? `,drawtext=fontfile=font.ttf:text='${n}':fontcolor=yellow:fontsize=36:x=10:y=6:box=1:boxcolor=black@0.65:boxborderw=6` : "";
    // increase+crop never overshoots the box (decrease+pad can fail by one pixel); format= keeps
    // tiles uniform for xstack when thumbnails mix PNG and JPEG.
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", `t${n}.jpg`, "-vf",
      `scale=400:225:force_original_aspect_ratio=increase,crop=400:225${label},format=yuvj420p`, `n${n}.jpg`], { cwd: dir });
    tiles.push(`n${n}.jpg`);
    lines.push(`${n}. ${m.name} — ${m.author} — ${m.lic} — ${m.faces} faces, ${m.anims} anims, ${m.glbMB} MB — ${m.url}${m.flag ? " — " + m.flag : ""}`);
  }
  const cols = 4;
  while (tiles.length % cols) tiles.push(null);   // pad the last row with black tiles
  const inputs = [];
  const filters = [];
  tiles.forEach((t, i) => {
    if (t) inputs.push("-i", t); else inputs.push("-f", "lavfi", "-i", "color=c=black:s=400x225:d=1");
    filters.push(`[${i}:v]`);
  });
  const layout = tiles.map((_, i) => `${(i % cols) * 400}_${Math.floor(i / cols) * 225}`).join("|");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex",
    `${filters.join("")}xstack=inputs=${tiles.length}:layout=${layout}`, "-frames:v", "1", "sheet.jpg"], { cwd: dir });
  // Trailing newline: a `while read` loop over a file without one silently drops the last line.
  fs.writeFileSync(path.join(dir, "sheet.txt"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.error(`-> ${path.join(dir, "sheet.jpg")}`);
}

async function info(uid) {
  if (!uid) throw new Error("info needs a model uid");
  const m = await api(`/models/${uid}`);
  console.log(JSON.stringify({
    name: m.name, author: m.user?.displayName, license: m.license?.slug, licenseUrl: m.license?.url,
    allowed: ALLOWED.includes(m.license?.slug),
    faces: m.faceCount, anims: m.animationCount, downloadable: m.isDownloadable,
    flag: RED_FLAGS.test(m.description || "") ? (m.description || "").match(RED_FLAGS)[0] : "",
    ip: IP_FLAGS.test(m.name || "") ? (m.name || "").match(IP_FLAGS)[0] : "",
    tags: (m.tags || []).map((t) => t.name).join(","), url: m.viewerUrl,
  }, null, 1));
}

// key=uid pairs → assets.mjs get sketchfab:<uid>=<key> --out <dest>/<key>
function get(pairs, o) {
  if (!TOKEN) throw new Error("downloads need SKETCHFAB_API_TOKEN (https://sketchfab.com/settings/password)");
  if (!pairs.length) throw new Error("get needs key=uid pairs");
  const dest = o.dest || "assets/models";
  for (const pair of pairs) {
    const [key, uid] = pair.split("=");
    if (!key || !uid) throw new Error(`expected key=uid, got "${pair}"`);
    const argv = [path.join(HERE, "assets.mjs"), "get", `sketchfab:${uid}=${key}`, "--out", `${dest}/${key}`,
      "--project", o.project || "."];
    if (o.assets) argv.push("--assets", o.assets);
    execFileSync(process.execPath, argv, { stdio: "inherit", env: { ...process.env, SKETCHFAB_API_TOKEN: TOKEN } });
  }
}

const o = args(process.argv.slice(2));
const [cmd, ...rest] = o._;
try {
  if (cmd === "search") await search(rest, o);
  else if (cmd === "sheet") await sheet(rest[0], o);
  else if (cmd === "info") await info(rest[0]);
  else if (cmd === "get") get(rest, o);
  else { console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(2, 21).join("\n")); process.exit(1); }
} catch (e) {
  console.error(`sketchfab: ${e.message}`);
  process.exit(1);
}

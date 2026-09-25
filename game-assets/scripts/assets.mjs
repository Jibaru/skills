#!/usr/bin/env node
/**
 * assets.mjs — search and download free game assets, and keep CREDITS.md honest.
 *
 * Dependency-free (Node 18+, global fetch). Zips are extracted with the
 * system `tar` (bsdtar on Windows/macOS) or `unzip`.
 *
 *   node scripts/assets.mjs search "stone wall" --type texture
 *   node scripts/assets.mjs search tree --source polypizza
 *   node scripts/assets.mjs get polyhaven:ArmChair_01 --res 1k
 *   node scripts/assets.mjs get kenney:tiny-dungeon
 *   node scripts/assets.mjs credits
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const UA = "gamedev-skills-game-assets/1.0 (+https://github.com/Jibaru/skills)";
const CACHE = path.join(os.tmpdir(), "game-assets-cache");

const USAGE = `
assets — search and download free game assets

Commands:
  search <query>          find candidates across sources
  get <source>:<id>       download one asset into the project and credit it
  credits                 rebuild CREDITS.md from assets/credits.json
  sources                 list sources and whether they are usable right now

Options:
  --source <name>         polyhaven | ambientcg | kenney | polypizza | gameicons
                          | freesound | all                       (default all)
  --type <kind>           model | texture | hdri | sprite | audio | icon
  --limit <n>             results per source                     (default 8)
  --res <1k|2k|4k>        texture/model/HDRI resolution           (default 1k)
  --project <dir>         game project root, where CREDITS.md goes (default .)
  --assets <dir>          asset folder, relative to the project  (default assets)
                          e.g. public/assets for a Vite game
  --allow-by              include CC-BY results (attribution required)
  --json                  machine-readable search output

Keys (optional, read from env):
  POLYPIZZA_API_KEY       https://poly.pizza/settings/api
  FREESOUND_API_KEY       https://freesound.org/apiv2/apply
`;

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const opts = { source: "all", type: null, limit: 8, res: "1k", project: ".", assets: "assets", allowBy: false, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--source": opts.source = next(); break;
      case "--type": opts.type = next(); break;
      case "--limit": opts.limit = Number(next()); break;
      case "--res": opts.res = next().toLowerCase(); break;
      case "--project": opts.project = next(); break;
      case "--assets": opts.assets = next(); break;
      case "--allow-by": opts.allowBy = true; break;
      case "--json": opts.json = true; break;
      case "-h": case "--help": opts.help = true; break;
      default:
        if (a.startsWith("--")) die(`unknown option ${a}`);
        rest.push(a);
    }
  }
  return { opts, rest };
}

function die(msg) {
  console.error(`assets: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- http

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.json();
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

async function download(url, dest, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 15).toString().toLowerCase().includes("<!doctype html")) {
    throw new Error(`got an HTML page instead of a file (bot protection?) — ${url}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function cached(name, ttlHours, fn) {
  const file = path.join(CACHE, name);
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < ttlHours * 3600e3) return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  const data = await fn();
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

function extractZip(zip, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const attempts = [
    ["tar", ["-xf", zip, "-C", destDir]],
    ["unzip", ["-o", "-q", zip, "-d", destDir]],
    ["python3", ["-m", "zipfile", "-e", zip, destDir]],
    ["python", ["-m", "zipfile", "-e", zip, destDir]],
    // GNU tar (Git Bash, Linux) cannot read zips; PowerShell always can.
    ["powershell", ["-NoProfile", "-Command", `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${destDir}'`]],
  ];
  for (const [cmd, args] of attempts) {
    const r = spawnSync(cmd, args, { stdio: "ignore" });
    if (r.status === 0) {
      fs.rmSync(zip, { force: true });
      return;
    }
  }
  throw new Error(`could not extract ${zip} (need tar, unzip or python)`);
}

// ---------------------------------------------------------------- matching

function score(query, haystack) {
  const words = query.toLowerCase().split(/[\s_-]+/).filter(Boolean);
  const tokens = haystack.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  let s = 0;
  for (const w of words) {
    // A whole word beats a prefix ("rock" should rank boulders above rocking chairs).
    if (tokens.includes(w) || tokens.includes(w.replace(/s$/, ""))) s += 1;
    else if (tokens.some((t) => t.startsWith(w) || w.startsWith(t) && t.length >= 4)) s += 0.4;
    else if (tokens.some((t) => t.includes(w))) s += 0.2;
  }
  return words.length ? s / words.length : 0;
}

function rank(query, items, text, limit) {
  return items
    .map((it) => ({ it, s: score(query, text(it)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.it);
}

// ---------------------------------------------------------------- sources
// Each source: { types, needs?, search(query, opts) -> [result], get(id, opts) -> credit }
// A result: { ref, title, type, license, author, url, note? }
// A credit: { ref, title, type, license, author, url, files: [relative paths] }

const PH_TYPES = { hdri: "hdris", texture: "textures", model: "models" };

const polyhaven = {
  types: ["model", "texture", "hdri"],
  async search(query, opts) {
    const kinds = opts.type ? [opts.type] : ["model", "texture", "hdri"];
    const out = [];
    for (const kind of kinds) {
      if (!PH_TYPES[kind]) continue;
      const all = await cached(`polyhaven-${kind}.json`, 24, () =>
        getJson(`https://api.polyhaven.com/assets?t=${PH_TYPES[kind]}`));
      const items = Object.entries(all).map(([id, a]) => ({ id, ...a }));
      for (const a of rank(query, items, (a) => [a.id, a.name, ...(a.tags || []), ...(a.categories || [])].join(" "), opts.limit)) {
        out.push({
          ref: `polyhaven:${a.id}`, title: a.name, type: kind, license: "CC0 1.0",
          author: Object.keys(a.authors || {}).join(", "), url: `https://polyhaven.com/a/${a.id}`,
          note: a.polycount ? `${a.polycount} tris` : undefined,
        });
      }
    }
    return out;
  },
  async get(id, opts) {
    const info = await getJson(`https://api.polyhaven.com/info/${id}`);
    const files = await getJson(`https://api.polyhaven.com/files/${id}`);
    const kind = { 0: "hdri", 1: "texture", 2: "model" }[info.type];
    const res = opts.res;
    const dir = path.join(opts.assetsDir, kind === "model" ? "models" : "textures", id);
    const written = [];
    const grab = async (url, rel) => {
      const dest = path.join(dir, rel);
      await download(url, dest);
      written.push(dest);
    };
    if (kind === "hdri") {
      const f = files.hdri?.[res]?.hdr || die(`no ${res} HDR for ${id}`);
      await grab(f.url, `${id}_${res}.hdr`);
    } else if (kind === "model") {
      const g = files.gltf?.[res]?.gltf || die(`no ${res} glTF for ${id}`);
      await grab(g.url, `${id}.gltf`);
      for (const [rel, f] of Object.entries(g.include || {})) await grab(f.url, rel);
    } else {
      const maps = { Diffuse: "diff", nor_gl: "nor_gl", Rough: "rough", arm: "arm", AO: "ao", Displacement: "disp" };
      for (const [key, short] of Object.entries(maps)) {
        const f = files[key]?.[res]?.jpg || files[key]?.[res]?.png;
        if (f) await grab(f.url, `${id}_${short}_${res}${path.extname(f.url)}`);
      }
    }
    return {
      ref: `polyhaven:${id}`, title: info.name, type: kind, license: "CC0 1.0",
      author: Object.keys(info.authors || {}).join(", "), url: `https://polyhaven.com/a/${id}`, files: written,
    };
  },
};

const AC_TYPES = { texture: "Material", hdri: "HDRI", model: "3DModel" };

const ambientcg = {
  types: ["texture", "hdri", "model"],
  async search(query, opts) {
    const t = opts.type && AC_TYPES[opts.type] ? `&type=${AC_TYPES[opts.type]}` : "";
    const j = await getJson(`https://ambientcg.com/api/v2/full_json?q=${encodeURIComponent(query)}&limit=${opts.limit}${t}&sort=Popular`);
    const back = Object.fromEntries(Object.entries(AC_TYPES).map(([k, v]) => [v, k]));
    return (j.foundAssets || []).map((a) => ({
      ref: `ambientcg:${a.assetId}`, title: a.displayName || a.assetId, type: back[a.dataType] || a.dataType,
      license: "CC0 1.0", author: "ambientCG", url: `https://ambientcg.com/view?id=${a.assetId}`,
    }));
  },
  async get(id, opts) {
    const j = await getJson(`https://ambientcg.com/api/v2/full_json?id=${encodeURIComponent(id)}&include=downloadData`);
    const a = j.foundAssets?.[0] || die(`ambientCG has no asset ${id}`);
    const downloads = Object.values(a.downloadFolders || {})
      .flatMap((f) => Object.values(f.downloadFiletypeCategories || {}))
      .flatMap((c) => c.downloads || []);
    const want = opts.res.toUpperCase();
    const pick =
      downloads.find((d) => d.attribute === `${want}-JPG`) ||
      downloads.find((d) => d.attribute?.startsWith(want)) ||
      downloads.sort((x, y) => x.size - y.size)[0] ||
      die(`no downloads for ${id}`);
    const kind = { Material: "texture", HDRI: "hdri", "3DModel": "model" }[a.dataType] || "texture";
    const dir = path.join(opts.assetsDir, kind === "model" ? "models" : "textures", id);
    const file = path.join(dir, pick.fileName);
    await download(pick.downloadLink, file);
    if (file.endsWith(".zip")) extractZip(file, dir);
    prune(dir, /\.(blend|usdc|usda|mtlx)$/i);
    return {
      ref: `ambientcg:${id}`, title: a.displayName || id, type: kind, license: "CC0 1.0",
      author: "ambientCG", url: `https://ambientcg.com/view?id=${id}`, files: listFiles(dir),
    };
  },
};

const kenney = {
  types: ["sprite", "model", "audio", "texture"],
  async search(query, opts) {
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "kenney-catalog.json"), "utf8"));
    const typeToCat = { sprite: "2d", model: "3d", audio: "audio", texture: "textures" };
    const packs = cat.packs.filter((p) => !opts.type || p.categories.includes(typeToCat[opts.type]));
    return rank(query, packs, (p) => p.slug + " " + p.categories.join(" "), opts.limit).map((p) => ({
      ref: `kenney:${p.slug}`, title: p.slug.replace(/-/g, " "), type: p.categories.join("/"),
      license: "CC0 1.0", author: "Kenney", url: `https://kenney.nl/assets/${p.slug}`, note: "whole pack (zip)",
    }));
  },
  async get(slug, opts) {
    const page = await getText(`https://kenney.nl/assets/${slug}`);
    const zipUrl = page.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"'\s]+\.zip/)?.[0]
      || die(`no zip link found on https://kenney.nl/assets/${slug}`);
    const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "assets", "kenney-catalog.json"), "utf8"));
    const cats = cat.packs.find((p) => p.slug === slug)?.categories || ["2d"];
    const folder = cats.includes("3d") ? "models" : cats.includes("audio") ? "audio" : cats.includes("textures") ? "textures" : "sprites";
    const dir = path.join(opts.assetsDir, folder, `kenney-${slug}`);
    const zip = path.join(dir, path.basename(zipUrl));
    await download(zipUrl, zip);
    extractZip(zip, dir);
    prune(dir, /\.url$/i);
    return {
      ref: `kenney:${slug}`, title: slug.replace(/-/g, " "), type: folder, license: "CC0 1.0",
      author: "Kenney", url: `https://kenney.nl/assets/${slug}`, files: [dir],
    };
  },
};

const polypizza = {
  types: ["model"],
  needs: "POLYPIZZA_API_KEY",
  headers: () => ({ "x-auth-token": process.env.POLYPIZZA_API_KEY }),
  async search(query, opts) {
    // Query params are Capitalized; lowercase ones are silently ignored by the API.
    const lic = opts.allowBy ? "" : "&License=1";
    const j = await getJson(`https://api.poly.pizza/v1.1/search/${encodeURIComponent(query)}?Limit=${Math.min(opts.limit, 32)}${lic}`, this.headers());
    return (j.results || []).map((m) => ({
      ref: `polypizza:${m.ID}`, title: m.Title, type: "model", license: m.Licence,
      author: m.Creator?.Username, url: `https://poly.pizza/m/${m.ID}`,
      note: `${m["Tri Count"]} tris${m.Animated ? ", animated" : ""}`,
    }));
  },
  async get(id, opts) {
    const m = await getJson(`https://api.poly.pizza/v1.1/model/${encodeURIComponent(id)}`, this.headers());
    const name = m.Title.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    const dest = path.join(opts.assetsDir, "models", `${name}-${id}.glb`);
    await download(m.Download, dest);
    return {
      ref: `polypizza:${id}`, title: m.Title, type: "model", license: m.Licence,
      author: m.Creator?.Username, url: `https://poly.pizza/m/${id}`, attribution: m.Attribution, files: [dest],
    };
  },
};

const gameicons = {
  types: ["icon"],
  async tree() {
    return cached("game-icons-tree.json", 24 * 7, async () => {
      const j = await getJson("https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1");
      return j.tree.filter((x) => x.path.endsWith(".svg")).map((x) => x.path);
    });
  },
  async search(query, opts) {
    const paths = await this.tree();
    return rank(query, paths, (p) => p.replace(/[/-]/g, " "), opts.limit).map((p) => ({
      ref: `gameicons:${p.replace(/\.svg$/, "")}`, title: path.basename(p, ".svg").replace(/-/g, " "), type: "icon",
      license: "CC BY 3.0", author: p.split("/")[0], url: `https://game-icons.net/1x1/${p.replace(/\.svg$/, ".html")}`,
    }));
  },
  async get(id, opts) {
    const dest = path.join(opts.assetsDir, "sprites", "icons", `${path.basename(id)}.svg`);
    await download(`https://raw.githubusercontent.com/game-icons/icons/master/${id}.svg`, dest);
    return {
      ref: `gameicons:${id}`, title: path.basename(id).replace(/-/g, " "), type: "icon", license: "CC BY 3.0",
      author: id.split("/")[0], url: `https://game-icons.net/1x1/${id}.html`, files: [dest],
    };
  },
};

const freesound = {
  types: ["audio"],
  needs: "FREESOUND_API_KEY",
  async search(query, opts) {
    const filter = opts.allowBy ? "" : `&filter=${encodeURIComponent('license:"Creative Commons 0"')}`;
    const fields = "id,name,license,username,duration,url";
    const j = await getJson(`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}${filter}&fields=${fields}&page_size=${opts.limit}&token=${process.env.FREESOUND_API_KEY}`);
    return (j.results || []).map((s) => ({
      ref: `freesound:${s.id}`, title: s.name, type: "audio", license: licenseName(s.license),
      author: s.username, url: s.url, note: `${s.duration.toFixed(1)}s`,
    }));
  },
  async get(id, opts) {
    const s = await getJson(`https://freesound.org/apiv2/sounds/${id}/?fields=id,name,license,username,url,previews&token=${process.env.FREESOUND_API_KEY}`);
    // Originals need OAuth2; the HQ mp3 preview is the same sound, same licence, and plays everywhere.
    const name = s.name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    const dest = path.join(opts.assetsDir, "audio", `${name}-${id}.mp3`);
    await download(s.previews["preview-hq-mp3"], dest);
    return {
      ref: `freesound:${id}`, title: s.name, type: "audio", license: licenseName(s.license),
      author: s.username, url: s.url, files: [dest],
    };
  },
};

function licenseName(url = "") {
  if (url.includes("publicdomain/zero")) return "CC0 1.0";
  if (url.includes("by-nc")) return "CC BY-NC";
  if (url.includes("/by/")) return "CC BY";
  if (url.includes("sampling+")) return "Sampling+";
  return url;
}

const SOURCES = { polyhaven, ambientcg, kenney, polypizza, gameicons, freesound };

function usable(name) {
  const s = SOURCES[name];
  return !s.needs || !!process.env[s.needs];
}

// Source-tool files (Blender, USD, shortcuts) that no game engine loads.
function prune(dir, pattern) {
  for (const f of listFiles(dir)) if (pattern.test(f)) fs.rmSync(f);
}

// ---------------------------------------------------------------- credits

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : out.push(p);
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}

function creditsPaths(project) {
  return { json: path.join(project, ASSETS, "credits.json"), md: path.join(project, "CREDITS.md") };
}

function loadCredits(project) {
  try { return JSON.parse(fs.readFileSync(creditsPaths(project).json, "utf8")); } catch { return []; }
}

function writeCredits(project, credits) {
  const p = creditsPaths(project);
  credits.sort((a, b) => a.ref.localeCompare(b.ref));
  fs.mkdirSync(path.dirname(p.json), { recursive: true });
  fs.writeFileSync(p.json, JSON.stringify(credits, null, 2) + "\n");

  const needsAttribution = credits.filter((c) => !/^CC0|public domain/i.test(c.license || ""));
  const row = (c) => `| ${c.title} | ${c.author || "—"} | ${c.license} | [source](${c.url}) | ${c.paths.map((x) => "`" + x + "`").join("<br>")} |`;
  const md = [
    "# Credits",
    "",
    "Third-party assets used in this game. Generated by `game-assets` from `" + ASSETS + "/credits.json` — edit that file, not this one.",
    "",
    needsAttribution.length
      ? `**${needsAttribution.length} asset(s) require attribution** — this file (or an in-game credits screen listing them) must ship with the game.`
      : "Every asset below is CC0 — attribution is not required, but it is kept here as a courtesy and a provenance record.",
    "",
    "| Asset | Author | License | Link | Files |",
    "| --- | --- | --- | --- | --- |",
    ...credits.map(row),
    "",
  ];
  for (const c of credits.filter((c) => c.attribution)) md.push(`- ${c.attribution}`);
  fs.writeFileSync(p.md, md.join("\n").trimEnd() + "\n");
}

function addCredit(project, credit) {
  const credits = loadCredits(project).filter((c) => c.ref !== credit.ref);
  const rel = (f) => path.relative(project, f).split(path.sep).join("/");
  credits.push({
    ref: credit.ref, title: credit.title, type: credit.type, license: credit.license, author: credit.author,
    url: credit.url, attribution: credit.attribution, paths: collapse(credit.files.map(rel)),
  });
  writeCredits(project, credits);
}

// Many files in one folder read better as that folder.
function collapse(paths) {
  if (paths.length <= 3) return paths;
  const dirs = [...new Set(paths.map((p) => p.split("/").slice(0, 3).join("/") + "/"))];
  return dirs;
}

// ---------------------------------------------------------------- commands

async function cmdSearch(query, opts) {
  if (!query) die("search needs a query");
  const names = opts.source === "all" ? Object.keys(SOURCES) : [opts.source];
  const results = [];
  const skipped = [];
  for (const name of names) {
    const s = SOURCES[name] || die(`unknown source ${name}`);
    if (opts.type && !s.types.includes(opts.type)) continue;
    if (!usable(name)) { skipped.push(`${name} (set ${s.needs})`); continue; }
    try {
      results.push(...(await s.search(query, opts)));
    } catch (e) {
      skipped.push(`${name} (${e.message})`);
    }
  }
  if (opts.json) {
    console.log(JSON.stringify({ results, skipped }, null, 2));
    return;
  }
  if (!results.length) console.log(`No matches for "${query}".`);
  for (const r of results) {
    console.log(`${r.ref.padEnd(44)} ${r.type.padEnd(8)} ${r.license.padEnd(10)} ${r.title}${r.note ? ` — ${r.note}` : ""}`);
    console.log(`${"".padEnd(44)} ${r.url}`);
  }
  if (skipped.length) console.log(`\nskipped: ${skipped.join(", ")}`);
}

async function cmdGet(ref, opts) {
  const m = /^([a-z]+):(.+)$/.exec(ref || "") || die("get needs <source>:<id>, e.g. polyhaven:ArmChair_01");
  const [, name, id] = m;
  const s = SOURCES[name] || die(`unknown source ${name}`);
  if (!usable(name)) die(`${name} needs ${s.needs} in the environment`);
  const project = path.resolve(opts.project);
  const credit = await s.get(id, { ...opts, assetsDir: path.join(project, ASSETS) });
  if (!/^CC0|CC BY( |$)|CC BY 3|CC BY 4/i.test(credit.license)) {
    console.warn(`WARNING: ${credit.ref} is ${credit.license} — check it allows your use before shipping.`);
  }
  addCredit(project, credit);
  const files = credit.files.map((f) => path.relative(project, f).split(path.sep).join("/"));
  console.log(`${credit.ref} → ${credit.license}, by ${credit.author}`);
  for (const f of files.slice(0, 20)) console.log(`  ${f}`);
  if (files.length > 20) console.log(`  … ${files.length - 20} more`);
  console.log(`credited in CREDITS.md`);
}

function cmdSources() {
  for (const [name, s] of Object.entries(SOURCES)) {
    const state = usable(name) ? "ready" : `needs ${s.needs}`;
    console.log(`${name.padEnd(10)} ${s.types.join(", ").padEnd(28)} ${state}`);
  }
}

const { opts, rest } = parseArgs(process.argv.slice(2));
const ASSETS = opts.assets;
const [cmd, ...args] = rest;
if (opts.help || !cmd) {
  console.log(USAGE.trim());
  process.exit(cmd ? 0 : 1);
}
try {
  if (cmd === "search") await cmdSearch(args.join(" "), opts);
  else if (cmd === "get") for (const ref of args) await cmdGet(ref, opts);
  else if (cmd === "credits") writeCredits(path.resolve(opts.project), loadCredits(path.resolve(opts.project)));
  else if (cmd === "sources") cmdSources();
  else die(`unknown command ${cmd}`);
} catch (e) {
  die(e.message);
}

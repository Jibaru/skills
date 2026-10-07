#!/usr/bin/env node
/**
 * assets.mjs — search and download free game assets, and keep CREDITS.md honest.
 *
 * Dependency-free (Node 18+, global fetch). Zips are extracted with the
 * system `tar` (bsdtar on Windows/macOS), `unzip`, python or PowerShell.
 *
 *   node scripts/assets.mjs search "stone wall" --type texture
 *   node scripts/assets.mjs get polyhaven:ArmChair_01 --res 1k
 *   node scripts/assets.mjs get freesound:865359=knock_wood_1 --out assets/audio/night
 *   node scripts/assets.mjs audit --src scripts,scenes
 *   node scripts/assets.mjs remove sketchfab:0d5590d1d2184aa98797c3d6382afd7e
 *   node scripts/assets.mjs credits
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const UA = "gamedev-skills-game-assets/1.1 (+https://github.com/Jibaru/skills)";
const CACHE = path.join(os.tmpdir(), "game-assets-cache");

const USAGE = `
assets — search, download and credit free game assets

Commands:
  search <query>              find candidates across sources
  get <source>:<id>[=name]... download into the project and credit it
                              (=name renames the file or folder on arrival)
  credits                     rebuild CREDITS.md from the credits record
  audit                       missing files, uncredited files, unused credits,
                              licences outside the public-repo policy
  remove <ref|path>...        delete an asset's files and its credit row
  edit <ref> [--changes t] [--notes t] [--attribution-required yes|no]
                              annotate a credit row (CC BY needs "changes")
  sources                     list sources and whether they are usable now

Options:
  --source <name>         polyhaven | ambientcg | kenney | gameicons | polypizza
                          | freesound | sketchfab | all            (default all)
  --type <kind>           model | texture | hdri | sprite | audio | icon
  --limit <n>             results per source                     (default 8)
  --res <1k|2k|4k>        texture/model/HDRI resolution           (default 1k)
  --project <dir>         game project root, where CREDITS.md goes (default .)
  --assets <dir>          asset root, relative to the project     (default assets)
                          e.g. public/assets for a Vite game. NOT a staging
                          folder: credits always go to the existing record.
  --out <dir>             put this download here (relative to the project);
                          credits still go to the main record
  --name <name>           rename a single download (same as ref=name)
  --raw                   download into <assets>/source/<type>/ and add a
                          .gdignore there (raw candidates Godot must not import)
  --allow-by              also accept CC BY (Freesound, Poly Pizza)
  --src <dirs>            audit: comma-separated code dirs  (default scripts,scenes,src)
  --json                  machine-readable search/audit output

Keys (optional, read from env):
  POLYPIZZA_API_KEY       https://poly.pizza/settings/api
  FREESOUND_API_KEY       https://freesound.org/apiv2/apply  (the "Client secret/API key")
  SKETCHFAB_API_TOKEN     https://sketchfab.com/settings/password

Set ASSETS_ALLOW_SHRINK=1 to let a rebuild drop more than one credit row.
`;

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const opts = {
    source: "all", type: null, limit: 8, res: "1k", project: ".", assets: "assets", allowBy: false, json: false,
    out: null, name: null, raw: false, src: "scripts,scenes,src", changes: null, notes: null, attributionRequired: null,
  };
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
      case "--out": opts.out = next(); break;
      case "--name": opts.name = next(); break;
      case "--raw": opts.raw = true; break;
      case "--src": opts.src = next(); break;
      case "--changes": opts.changes = next(); break;
      case "--notes": opts.notes = next(); break;
      case "--attribution-required": opts.attributionRequired = /^(yes|true|1)$/i.test(next()); break;
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

async function getJson(url, headers = {}, tries = 3) {
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
    // Sketchfab and GitHub rate-limit anonymous bursts; back off instead of failing the batch.
    if (res.status === 429 && i < tries) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url.replace(/token=[^&]+/, "token=…")}`);
    return res.json();
  }
}

async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

async function download(url, dest, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url.replace(/token=[^&]+/, "token=…")}`);
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
    // timeout: a bare `python` on Windows can be the Microsoft Store stub, which hangs.
    const r = spawnSync(cmd, args, { stdio: "ignore", timeout: 120000 });
    if (r.status === 0) {
      fs.rmSync(zip, { force: true });
      return;
    }
  }
  throw new Error(`could not extract ${zip} (need tar, unzip, python or PowerShell)`);
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

// ---------------------------------------------------------------- licences

/**
 * A licence URL (or Sketchfab slug) to a short name WITH its version.
 * The version matters: CC BY 3.0 and 4.0 differ, and BY-SA must not collapse into BY.
 */
function licenseName(url = "") {
  if (/publicdomain\/zero|^cc0$/i.test(url)) return "CC0 1.0";
  const m = url.match(/licenses\/(by(?:-nc)?(?:-sa|-nd)?)\/(\d\.\d)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  if (/sampling\+/i.test(url)) return "Sampling+";
  return url;
}

const LICENSE_URLS = {
  "CC0 1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
  "SIL OFL 1.1": "https://openfontlicense.org/open-font-license-official-text/",
};

/**
 * Does this licence oblige the game to credit the asset?
 * Explicit, because "everything that is not CC0" over-counts: generated audio, the team's own
 * work and OFL-vs-CC distinctions all got lumped together (a project reported 78 when 63 was right).
 * A row's own `attribution_required` always wins.
 */
function attributionRequired(row) {
  if (typeof row.attribution_required === "boolean") return row.attribution_required;
  const l = row.license || "";
  if (/^CC0|public domain/i.test(l)) return false;
  if (/^CC BY|CC Attribution/i.test(l)) return true;          // BY, BY-SA (and legacy unversioned labels)
  if (/OFL/i.test(l)) return true;                              // the OFL notice must ship with the font
  if (/^own\b|generated|elevenlabs/i.test(l) || /^(own|elevenlabs)/i.test(row.ref || "")) return false;
  return false;
}

/**
 * Licences safe for a PUBLIC repo or public game files. Everything else either forbids
 * redistributing raw files (Sketchfab/Fab "Standard", store EULAs, Mixamo), forbids commercial
 * use (NC), or forbids modification (ND).
 */
function licensePolicy(row) {
  const l = row.license || "";
  if (/-NC|NonCommercial/i.test(l)) return "rejected: non-commercial";
  if (/-ND|NoDerivs/i.test(l)) return "rejected: no derivatives";
  if (/^CC0|^CC BY(-SA)? \d/i.test(l) || /OFL/i.test(l)) return "ok";
  if (/^CC BY(-SA)?$|^CC Attribution(-ShareAlike)?$/i.test(l)) return "ok, but record the licence version and URL";
  if (/^own\b|generated|elevenlabs/i.test(l)) return "ok (check the generator's plan allows commercial use)";
  if (/standard|mixamo|eula|royalty|sampling/i.test(l)) return "restricted: use in-game only, never in a public repo";
  return "unknown licence: read it before shipping";
}

// ---------------------------------------------------------------- sources
// Each source: { types, needs?, search(query, opts) -> [result], get(id, opts) -> credit }
// A result: { ref, title, type, license, author, url, note? }
// A credit: { ref, title, type, license, license_url?, author, url, notes?, files: [absolute paths] }

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
      license_url: LICENSE_URLS["CC BY 3.0"], author: id.split("/")[0], url: `https://game-icons.net/1x1/${id}.html`, files: [dest],
    };
  },
};

const freesound = {
  types: ["audio"],
  needs: "FREESOUND_API_KEY",
  async search(query, opts) {
    // --allow-by widens to Attribution only. Without the explicit OR, "allow BY" used to drop the
    // filter entirely and let NonCommercial and Sampling+ sounds through.
    const lic = opts.allowBy ? 'license:("Creative Commons 0" OR "Attribution")' : 'license:"Creative Commons 0"';
    const fields = "id,name,license,username,duration,url,tags";
    const j = await getJson(`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&filter=${encodeURIComponent(lic)}&fields=${fields}&page_size=${opts.limit}&token=${process.env.FREESOUND_API_KEY}`);
    return (j.results || []).map((s) => ({
      ref: `freesound:${s.id}`, title: s.name, type: "audio", license: licenseName(s.license),
      author: s.username, url: s.url, note: `${s.duration.toFixed(1)}s`,
    }));
  },
  async get(id, opts) {
    const s = await getJson(`https://freesound.org/apiv2/sounds/${id}/?fields=id,name,license,username,url,previews,description&token=${process.env.FREESOUND_API_KEY}`);
    // Originals need OAuth2; the HQ mp3 preview is the same sound, same licence, and plays everywhere.
    const name = s.name.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
    const dest = path.join(opts.assetsDir, "audio", `${name}-${id}.mp3`);
    await download(s.previews["preview-hq-mp3"], dest);
    return {
      ref: `freesound:${id}`, title: s.name, type: "audio", license: licenseName(s.license), license_url: s.license,
      author: s.username, url: s.url, files: [dest],
    };
  },
};

// Sketchfab: CC0 / CC BY / CC BY-SA only. "Free Standard" and "Standard" allow use inside a game but
// forbid redistributing the raw file, which a public repo or an unpacked build does.
const SKETCHFAB_ALLOWED = ["cc0", "by", "by-sa"];
const SKETCHFAB_RED_FLAGS = /non[- ]?commercial|personal use only|not for commercial|ripped|extracted from|from the game|asset store|do not (re)?upload|fan ?art|meshy|tripo|ai[- ]generated/i;

const sketchfab = {
  types: ["model"],
  needs: "SKETCHFAB_API_TOKEN",
  headers: () => ({ Authorization: `Token ${process.env.SKETCHFAB_API_TOKEN}` }),
  async search(query, opts) {
    const out = [];
    // The API honours ONE `license=` value per request; repeating the parameter keeps only the last.
    for (const lic of SKETCHFAB_ALLOWED) {
      const j = await getJson(`https://api.sketchfab.com/v3/search?type=models&downloadable=true&sort_by=-likeCount&count=24&license=${lic}&q=${encodeURIComponent(query)}`, this.headers());
      for (const m of j.results || []) {
        out.push({
          ref: `sketchfab:${m.uid}`, title: m.name, type: "model", license: lic === "cc0" ? "CC0 1.0" : `CC ${lic.toUpperCase()} 4.0`,
          author: m.user?.displayName || m.user?.username, url: `https://sketchfab.com/3d-models/${m.uid}`,
          note: `${m.faceCount} faces, ${m.animationCount} anims, ♥${m.likeCount}`,
        });
      }
    }
    return out.slice(0, opts.limit * 3);
  },
  async get(uid, opts) {
    const m = await getJson(`https://api.sketchfab.com/v3/models/${uid}`, this.headers());
    const slug = m.license?.slug;
    if (!SKETCHFAB_ALLOWED.includes(slug)) {
      die(`sketchfab:${uid} is "${m.license?.label}" — only CC0, CC BY and CC BY-SA are accepted (see references/sources.md)`);
    }
    const flag = (m.description || "").match(SKETCHFAB_RED_FLAGS)?.[0];
    if (flag) console.warn(`WARNING: description of sketchfab:${uid} mentions "${flag}" — read it before shipping`);
    // Signed URLs expire within minutes: request and fetch in one go.
    const dl = await getJson(`https://api.sketchfab.com/v3/models/${uid}/download`, this.headers());
    const key = (m.name || uid).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || uid;
    const dir = path.join(opts.assetsDir, "models", key);
    let files;
    if (dl.glb) {
      const dest = path.join(dir, `${key}.glb`);
      await download(dl.glb.url, dest);
      files = [dest];
    } else if (dl.gltf) {
      const zip = path.join(dir, "_dl.zip");
      await download(dl.gltf.url, zip);
      extractZip(zip, dir);
      files = [dir];
    } else {
      die(`sketchfab:${uid} offers no glb/gltf download`);
    }
    return {
      ref: `sketchfab:${uid}`, title: m.name, type: "model",
      license: licenseName(m.license?.url || slug), license_url: m.license?.url,
      author: m.user?.displayName || m.user?.username, url: m.viewerUrl || `https://sketchfab.com/3d-models/${uid}`,
      notes: `${m.faceCount} faces, ${m.animationCount} anims`, files,
    };
  },
};

const SOURCES = { polyhaven, ambientcg, kenney, polypizza, gameicons, freesound, sketchfab };

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

const rel = (project, f) => path.relative(project, f).split(path.sep).join("/");

/**
 * Where the credits record lives. An existing record always wins over --assets.
 *
 * --assets once doubled as a staging folder (`--assets assets/audio/night_dl`): that created a
 * near-empty credits.json there and rebuilt the project's CREDITS.md from it alone — the whole
 * file wiped, at least four times in one project. The record is found, not derived.
 */
function creditsPaths(project) {
  const md = path.join(project, "CREDITS.md");
  for (const r of [ASSETS, "assets", "public/assets"]) {
    const j = path.join(project, r, "credits.json");
    if (fs.existsSync(j)) return { json: j, md };
  }
  return { json: path.join(project, ASSETS, "credits.json"), md };
}

function loadCredits(project) {
  const p = creditsPaths(project).json;
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { die(`${p} is not valid JSON (${e.message}) — fix it by hand; refusing to overwrite it`); }
}

function writeCredits(project, credits, { allowShrinkBy = 1 } = {}) {
  const p = creditsPaths(project);
  if (fs.existsSync(p.json) && !process.env.ASSETS_ALLOW_SHRINK) {
    const before = JSON.parse(fs.readFileSync(p.json, "utf8")).length;
    if (credits.length < before - allowShrinkBy) {
      die(`refusing to shrink ${rel(project, p.json)} from ${before} to ${credits.length} rows (set ASSETS_ALLOW_SHRINK=1 if that is intended)`);
    }
  }
  credits.sort((a, b) => a.ref.localeCompare(b.ref));
  fs.mkdirSync(path.dirname(p.json), { recursive: true });
  fs.writeFileSync(p.json, JSON.stringify(credits, null, 2) + "\n");

  const required = credits.filter(attributionRequired);
  const flagged = credits.filter((c) => !licensePolicy(c).startsWith("ok"));
  const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lic = (c) => (c.license_url || LICENSE_URLS[c.license] ? `[${cell(c.license)}](${c.license_url || LICENSE_URLS[c.license]})` : cell(c.license));
  const row = (c) =>
    `| ${cell(c.title)} | ${cell(c.author) || "—"} | ${lic(c)} | [source](${c.url}) | ${cell(c.changes) || "—"} | ${(c.paths || []).map((x) => "`" + x + "`").join("<br>")} |`;
  const md = [
    "# Credits",
    "",
    "Third-party assets used in this game. Generated by `game-assets` from `" + rel(project, p.json) + "` — edit that file, not this one.",
    "",
    required.length
      ? `**${required.length} asset(s) require attribution** (CC BY, CC BY-SA, OFL) — this file or an in-game credits screen listing them must ship with the game. CC BY also requires stating changes: see the Changes column.`
      : "No asset below requires attribution; they are listed as a courtesy and a provenance record.",
    ...(flagged.length ? ["", `**${flagged.length} asset(s) need a licence check** — run \`assets.mjs audit\`.`] : []),
    "",
    "| Asset | Author | License | Link | Changes | Files |",
    "| --- | --- | --- | --- | --- | --- |",
    ...credits.map(row),
    "",
  ];
  for (const c of credits.filter((c) => c.attribution)) md.push(`- ${c.attribution}`);
  fs.writeFileSync(p.md, md.join("\n").trimEnd() + "\n");
}

function addCredit(project, credit) {
  const credits = loadCredits(project).filter((c) => c.ref !== credit.ref);
  const old = loadCredits(project).find((c) => c.ref === credit.ref);
  credits.push(Object.fromEntries(Object.entries({
    ref: credit.ref, title: credit.title, type: credit.type, license: credit.license,
    license_url: credit.license_url || LICENSE_URLS[credit.license], author: credit.author, url: credit.url,
    attribution: credit.attribution, notes: credit.notes ?? old?.notes, changes: old?.changes,
    attribution_required: old?.attribution_required,
    paths: collapse(credit.files.map((f) => rel(project, f))),
  }).filter(([, v]) => v !== undefined)));
  writeCredits(project, credits);
}

// Many files under one folder read better as that folder (their deepest common directory).
function collapse(paths) {
  if (paths.length <= 3) return paths;
  const parts = paths.map((p) => p.split("/").slice(0, -1));
  const common = [];
  for (let i = 0; parts.every((p) => i < p.length && p[i] === parts[0][i]); i++) common.push(parts[0][i]);
  return common.length ? [common.join("/") + "/"] : paths;
}

/**
 * Move a fresh download to --out and/or rename it, so the file lands with its final name and no
 * staging-and-merge script is needed (`26_07_26_Knocking_on_Wooden_Door_1-865359.mp3` →
 * `knock_wood_1.mp3`). One file is renamed keeping its extension; several files move as their folder.
 */
function relocate(credit, project, opts, name) {
  if (!opts.out && !name && !opts.raw) return credit;
  const isDir = credit.files.length === 1 && fs.statSync(credit.files[0]).isDirectory();
  // Where it goes: --out, else --raw's source folder, else where it already is (a plain rename).
  const here = credit.files.length === 1 && !isDir ? path.dirname(credit.files[0]) : path.dirname(isDir ? credit.files[0] : commonDir(credit.files));
  const outDir = opts.out
    ? path.resolve(project, opts.out)
    : opts.raw ? path.resolve(project, ASSETS, "source", credit.type || "misc") : here;
  fs.mkdirSync(outDir, { recursive: true });
  if (credit.files.length === 1 && !isDir) {
    const src = credit.files[0];
    const dest = path.join(outDir, (name || path.basename(src, path.extname(src))) + path.extname(src));
    if (path.resolve(src) !== path.resolve(dest)) fs.renameSync(src, dest);
    removeIfEmpty(path.dirname(src));
    return { ...credit, files: [dest] };
  }
  const srcDir = isDir ? credit.files[0] : commonDir(credit.files);
  const dest = path.join(outDir, name || path.basename(srcDir));
  if (path.resolve(srcDir) !== path.resolve(dest)) {
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(srcDir, dest);
  }
  return { ...credit, files: credit.files.map((f) => path.join(dest, path.relative(srcDir, f))) };
}

function commonDir(files) {
  let dir = path.dirname(files[0]);
  while (!files.every((f) => f.startsWith(dir + path.sep))) dir = path.dirname(dir);
  return dir;
}

function removeIfEmpty(dir) {
  try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch {}
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
    console.log(`${r.ref.padEnd(44)} ${r.type.padEnd(8)} ${r.license.padEnd(12)} ${r.title}${r.note ? ` — ${r.note}` : ""}`);
    console.log(`${"".padEnd(44)} ${r.url}`);
  }
  if (skipped.length) console.log(`\nskipped: ${skipped.join(", ")}`);
}

async function cmdGet(spec, opts) {
  // source:id[=name] — the name renames the download, so batch renames need no merge script.
  const m = /^([a-z]+):([^=]+)(?:=(.+))?$/.exec(spec || "") || die("get needs <source>:<id>[=name], e.g. polyhaven:ArmChair_01");
  const [, name, id, rename] = m;
  const s = SOURCES[name] || die(`unknown source ${name}`);
  if (!usable(name)) die(`${name} needs ${s.needs} in the environment`);
  const project = path.resolve(opts.project);
  if (opts.raw) {
    const srcRoot = path.join(project, ASSETS, "source");
    fs.mkdirSync(srcRoot, { recursive: true });
    // Raw candidates are not game assets yet: Godot must not import (or ship) them.
    if (!fs.existsSync(path.join(srcRoot, ".gdignore"))) fs.writeFileSync(path.join(srcRoot, ".gdignore"), "");
  }
  let credit = await s.get(id, { ...opts, assetsDir: path.join(project, ASSETS) });
  credit = relocate(credit, project, opts, rename || opts.name);
  const policy = licensePolicy(credit);
  if (!policy.startsWith("ok")) console.warn(`WARNING: ${credit.ref} is ${credit.license} — ${policy}`);
  addCredit(project, credit);
  const files = credit.files.map((f) => rel(project, f));
  console.log(`${credit.ref} → ${credit.license}, by ${credit.author}`);
  for (const f of files.slice(0, 20)) console.log(`  ${f}`);
  if (files.length > 20) console.log(`  … ${files.length - 20} more`);
  console.log(`credited in ${rel(project, creditsPaths(project).json)} and CREDITS.md`);
}

function cmdEdit(ref, opts) {
  const project = path.resolve(opts.project);
  const credits = loadCredits(project);
  const row = credits.find((c) => c.ref === ref) || die(`no credit row ${ref}`);
  if (opts.changes !== null) row.changes = opts.changes;
  if (opts.notes !== null) row.notes = opts.notes;
  if (opts.attributionRequired !== null) row.attribution_required = opts.attributionRequired;
  writeCredits(project, credits);
  console.log(`${ref} updated`);
}

/** Files a credit row covers, expanded (folders → their files). */
function coveredFiles(project, credits) {
  const set = new Set();
  for (const c of credits) {
    for (const p of c.paths || []) {
      const abs = path.join(project, p);
      if (!fs.existsSync(abs)) continue;
      if (fs.statSync(abs).isDirectory()) for (const f of listFiles(abs)) set.add(rel(project, f));
      else set.add(rel(project, abs));
    }
  }
  return set;
}

const IGNORED_ASSET_FILES = /(\.import|\.uid|\.gdignore|credits\.json|\.DS_Store|Thumbs\.db|kenney-catalog\.json)$/i;
const CODE_FILES = /\.(gd|tscn|tres|cs|ts|tsx|js|jsx|mjs|cjs|json|html|css|gdshader|gdshaderinc|cfg|godot)$/i;

function cmdAudit(opts) {
  const project = path.resolve(opts.project);
  const credits = loadCredits(project);
  const assetsRoot = path.join(project, ASSETS);
  const report = { missing: [], uncredited: [], unused: [], licence: [] };

  // 1. Rows pointing at nothing.
  for (const c of credits) {
    const gone = (c.paths || []).filter((p) => !fs.existsSync(path.join(project, p)));
    if (gone.length) report.missing.push({ ref: c.ref, paths: gone });
  }

  // 2. Files in the asset folder with no credit row (generated/own files need a row too, so
  //    provenance is complete; give them license "own" or "generated").
  const covered = coveredFiles(project, credits);
  // Godot extracts a GLB's embedded textures next to it (chabudai.glb → chabudai_0.png,
  // creature_gray_Image_0.png): those are part of the credited model, not new assets.
  const stems = new Set([...covered].filter((f) => /\.(glb|gltf|fbx|obj|blend)$/i.test(f)).map((f) => f.replace(/\.[^.]+$/, "")));
  const extracted = (r) => [...stems].some((s) => r.startsWith(s + "_") && /\.(png|jpe?g|webp)$/i.test(r));
  for (const f of listFiles(assetsRoot)) {
    const r = rel(project, f);
    if (IGNORED_ASSET_FILES.test(r)) continue;
    if (!covered.has(r) && !extracted(r)) report.uncredited.push(r);
  }

  // 3. Credited assets nothing references: no code file mentions the file or folder name.
  const srcDirs = opts.src.split(",").map((d) => path.join(project, d.trim())).filter((d) => fs.existsSync(d));
  const code = srcDirs.flatMap(listFiles).filter((f) => CODE_FILES.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  if (srcDirs.length) {
    for (const c of credits) {
      const present = (c.paths || []).filter((p) => fs.existsSync(path.join(project, p)));
      if (!present.length) continue;
      const used = present.some((p) => {
        const base = path.basename(p.replace(/\/$/, ""));
        return code.includes(p.replace(/\/$/, "")) || code.includes(base);
      });
      if (!used) report.unused.push({ ref: c.ref, paths: present });
    }
  }

  // 4. Licences outside the public-repo policy, or missing a version/URL. Generated audio
  //    ("ok (check the plan)") is counted once instead of listed row by row.
  let generated = 0;
  for (const c of credits) {
    const policy = licensePolicy(c);
    if (policy.startsWith("ok (")) generated++;
    else if (policy !== "ok") report.licence.push({ ref: c.ref, license: c.license, policy });
  }
  report.generated = generated;

  if (opts.json) { console.log(JSON.stringify(report, null, 2)); return; }
  const section = (title, items, fmt) => {
    console.log(`\n${title}: ${items.length}`);
    for (const i of items.slice(0, 40)) console.log(`  ${fmt(i)}`);
    if (items.length > 40) console.log(`  … ${items.length - 40} more (use --json)`);
  };
  console.log(`audit of ${rel(project, creditsPaths(project).json)} — ${credits.length} rows`);
  section("rows whose files are gone", report.missing, (i) => `${i.ref}  ${i.paths.join(", ")}`);
  // Grouped by folder: derived cuts (steps/gravel_1..8.ogg) usually miss from the raw source's row
  // as a set, and 470 lines of one-per-file output is unreadable.
  const byDir = new Map();
  for (const f of report.uncredited) {
    const d = f.split("/").slice(0, -1).join("/") + "/";
    byDir.set(d, [...(byDir.get(d) || []), path.posix.basename(f)]);
  }
  section(`files in ${ASSETS}/ with no credit row (${report.uncredited.length}, by folder; add them to the row of the asset they came from, or a row of their own)`,
    [...byDir], ([d, names]) => `${d}  ${names.length} file(s): ${names.slice(0, 4).join(", ")}${names.length > 4 ? ", …" : ""}`);
  section(srcDirs.length
    ? `credited assets no file in ${opts.src} references by name (paths built at runtime show up here too — confirm before removing)`
    : `unused check skipped (no ${opts.src} dirs)`,
  report.unused, (i) => `${i.ref}  ${i.paths.slice(0, 3).join(", ")}${i.paths.length > 3 ? `, … (${i.paths.length})` : ""}`);
  section("licences to check", report.licence, (i) => `${i.ref}  ${i.license} — ${i.policy}`);
  if (report.generated) console.log(`\n${report.generated} generated asset row(s): confirm the generator plan allows commercial use.`);
  const bad = report.missing.length + report.licence.filter((l) => /rejected|restricted|unknown/.test(l.policy)).length;
  process.exitCode = bad ? 1 : 0;
}

function cmdRemove(targets, opts) {
  if (!targets.length) die("remove needs a ref or a path");
  const project = path.resolve(opts.project);
  const credits = loadCredits(project);
  const keep = [];
  const removed = [];
  for (const c of credits) {
    const hit = targets.some((t) => c.ref === t || (c.paths || []).some((p) => p === t || p.replace(/\/$/, "") === t.replace(/\/$/, "")));
    (hit ? removed : keep).push(c);
  }
  if (!removed.length) die(`no credit row matches ${targets.join(", ")}`);
  for (const c of removed) {
    for (const p of c.paths || []) {
      const abs = path.join(project, p);
      fs.rmSync(abs, { recursive: true, force: true });
      for (const sib of [".import", ".uid"]) fs.rmSync(abs + sib, { force: true });
      removeIfEmpty(path.dirname(abs));
    }
    console.log(`removed ${c.ref}  (${(c.paths || []).join(", ")})`);
  }
  writeCredits(project, keep, { allowShrinkBy: removed.length });
  console.log(`credits rebuilt — ${keep.length} rows; grep your code for the removed paths`);
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
  else if (cmd === "get") {
    if (opts.name && args.length > 1) die("--name renames one download; use source:id=name for several");
    for (const ref of args) await cmdGet(ref, opts);
  }
  else if (cmd === "credits") writeCredits(path.resolve(opts.project), loadCredits(path.resolve(opts.project)));
  else if (cmd === "audit") cmdAudit(opts);
  else if (cmd === "remove") cmdRemove(args, opts);
  else if (cmd === "edit") cmdEdit(args[0], opts);
  else if (cmd === "sources") cmdSources();
  else die(`unknown command ${cmd}`);
} catch (e) {
  die(e.message);
}

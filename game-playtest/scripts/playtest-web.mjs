#!/usr/bin/env node
/**
 * playtest-web.mjs — drive a browser game with a scripted input sequence,
 * capture screenshots, and report console errors and blank frames.
 *
 * Needs `playwright` resolvable from the game project (npm i -D playwright)
 * plus a Chromium (npx playwright install chromium). Nothing else.
 *
 *   node scripts/playtest-web.mjs playtest/scripts/smoke.json --url http://localhost:5173
 *   node scripts/playtest-web.mjs playtest/scripts/smoke.json --cmd "npm run dev" --url http://localhost:5173
 *   node scripts/playtest-web.mjs playtest/scripts/smoke.json --dist dist
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const USAGE = `
playtest-web — scripted browser playtest with screenshots

Usage: node playtest-web.mjs <script.json...> [options]

Target (one of):
  --url <url>          an already-running game
  --cmd "<command>"    start a dev server first (needs --url too), killed afterwards
  --dist <dir>         serve a static build folder on a free port

Options:
  --project <dir>      game project root, where playwright is installed  (default .)
  --out <dir>          screenshot root                    (default playtest/screenshots)
  --headed             show the browser window
  --timeout <ms>       page/server start timeout          (default 30000)
`;

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2);
const opts = { scripts: [], project: ".", out: "playtest/screenshots", timeout: 30000, headed: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--url") opts.url = argv[++i];
  else if (a === "--cmd") opts.cmd = argv[++i];
  else if (a === "--dist") opts.dist = argv[++i];
  else if (a === "--project") opts.project = argv[++i];
  else if (a === "--out") opts.out = argv[++i];
  else if (a === "--timeout") opts.timeout = Number(argv[++i]);
  else if (a === "--headed") opts.headed = true;
  else if (a === "-h" || a === "--help") { console.log(USAGE.trim()); process.exit(0); }
  else opts.scripts.push(a);
}
if (!opts.scripts.length || !(opts.url || opts.dist)) { console.log(USAGE.trim()); process.exit(1); }

function die(msg) {
  console.error(`playtest-web: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- playwright

function loadPlaywright() {
  const req = createRequire(path.resolve(opts.project, "package.json"));
  try {
    return req("playwright");
  } catch {
    die(
      `playwright is not installed in ${path.resolve(opts.project)}.\n` +
      `  npm i -D playwright && npx playwright install chromium`,
    );
  }
}

// ---------------------------------------------------------------- target

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".wasm": "application/wasm",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream", ".ktx2": "image/ktx2",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".pck": "application/octet-stream",
};

function serveStatic(dir) {
  const root = path.resolve(dir);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(root, p);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
    // Godot web exports need cross-origin isolation for SharedArrayBuffer.
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () =>
    resolve({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

async function waitForUrl(url, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`nothing answered at ${url} within ${timeout} ms`);
}

function startCmd(cmd) {
  const child = spawn(cmd, { shell: true, cwd: path.resolve(opts.project), stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  child.getLog = () => log;
  return child;
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  // Synchronous: a server still dying when the next run starts steals its port.
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

// ---------------------------------------------------------------- analysis

// Decode the PNG in the page itself (no image deps here) and measure it.
async function analyse(page, png) {
  return page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const colors = new Set();
    let sum = 0;
    const stride = 4 * 7; // sample every 7th pixel
    for (let i = 0; i < d.length; i += stride) {
      colors.add(((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3));
      sum += d[i] + d[i + 1] + d[i + 2];
    }
    const n = d.length / stride;
    return { colors: colors.size, brightness: Math.round(sum / n / 3) };
  }, png.toString("base64"));
}

// ---------------------------------------------------------------- steps

const KEY_ALIASES = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", space: "Space", enter: "Enter", esc: "Escape" };
const key = (k) => KEY_ALIASES[k.toLowerCase?.()] || k;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runScript(browser, scriptPath, baseUrl) {
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const name = script.name || path.basename(scriptPath, ".json");
  const outDir = path.resolve(opts.project, opts.out, name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const [w, h] = script.viewport || [1280, 720];
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
    else if (m.type() === "warning") warnings.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
  // Browsers ask for /favicon.ico on their own; a missing one is not the game's fault.
  const noise = (url) => //favicon.ico(?|$)/.test(url);
  page.on("console", (m) => {
    if (m.type() === "error" && /Failed to load resource/.test(m.text()) && noise(m.location()?.url || "")) errors.pop();
  });
  page.on("requestfailed", (r) => { if (!noise(r.url())) errors.push(`request failed: ${r.url()} (${r.failure()?.errorText})`); });
  page.on("response", (r) => { if (r.status() >= 400 && !noise(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

  const url = new URL(script.path || "", baseUrl).toString();
  await page.goto(url, { waitUntil: "load", timeout: opts.timeout });
  await page.waitForSelector(script.canvas || "canvas", { timeout: opts.timeout }).catch(() =>
    errors.push(`no ${script.canvas || "canvas"} element appeared within ${opts.timeout} ms`));

  const shots = [];
  const checks = [];
  let shotN = 0;
  const target = script.canvas || "canvas";

  for (const step of script.steps || []) {
    if ("wait" in step) await sleep(step.wait);
    else if ("press" in step) await page.keyboard.press(key(step.press));
    else if ("hold" in step || "keys" in step) {
      const keys = [].concat(step.hold ?? step.keys).map(key);
      for (const k of keys) await page.keyboard.down(k);
      await sleep(step.ms ?? 500);
      for (const k of keys.reverse()) await page.keyboard.up(k);
    } else if ("type" in step) await page.keyboard.type(step.type);
    else if ("click" in step) {
      const box = await page.locator(target).first().boundingBox();
      const [x, y] = step.click;
      await page.mouse.click((box?.x || 0) + x, (box?.y || 0) + y);
    } else if ("move" in step) {
      const box = await page.locator(target).first().boundingBox();
      await page.mouse.move((box?.x || 0) + step.move[0], (box?.y || 0) + step.move[1], { steps: 5 });
    } else if ("eval" in step) {
      const v = await page.evaluate(step.eval).catch((e) => `ERROR ${e.message}`);
      checks.push({ eval: step.eval, value: v });
    } else if ("expect" in step) {
      const ok = await page.evaluate(step.expect).catch((e) => `ERROR ${e.message}`);
      checks.push({ expect: step.expect, pass: ok === true, value: ok });
    } else if ("screenshot" in step) {
      shotN += 1;
      const file = path.join(outDir, `${String(shotN).padStart(2, "0")}-${step.screenshot}.png`);
      const el = step.full ? page : page.locator(target).first();
      const png = await el.screenshot({ path: file }).catch(() => page.screenshot({ path: file }));
      const stats = await analyse(page, png);
      const blank = stats.colors <= 1; // one flat colour: nothing drew over the clear colour
      shots.push({ file: path.relative(path.resolve(opts.project), file).split(path.sep).join("/"), ...stats, blank });
    } else {
      errors.push(`unknown step ${JSON.stringify(step)}`);
    }
  }

  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => (++n, performance.now() - t0 < 1000 ? requestAnimationFrame(tick) : res(n));
    requestAnimationFrame(tick);
  }));

  await context.close();
  const failed = errors.length > 0 || shots.some((s) => s.blank) || checks.some((c) => c.pass === false);
  const report = { name, url, viewport: [w, h], pass: !failed, fps, errors, warnings: warnings.slice(0, 20), checks, screenshots: shots };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

// ---------------------------------------------------------------- main

const { chromium } = loadPlaywright();
let server;
let child;
let baseUrl = opts.url;
let exitCode = 0;
try {
  if (opts.dist) ({ server, url: baseUrl } = await serveStatic(path.resolve(opts.project, opts.dist)));
  if (opts.cmd) {
    const busy = await fetch(baseUrl).then(() => true, () => false);
    if (busy) die(`something is already serving ${baseUrl}; stop it, or drop --cmd to test that server`);
    child = startCmd(opts.cmd);
  }
  await waitForUrl(baseUrl, opts.timeout).catch((e) => die(`${e.message}${child ? `\n--- server output ---\n${child.getLog()}` : ""}`));

  const browser = await chromium.launch({
    headless: !opts.headed,
    // Headless: software WebGL, so it renders on machines without a GPU.
    // Headed: leave the real GPU alone.
    args: [
      ...(opts.headed ? [] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
      "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required",
    ],
  });
  // Dev servers (Vite) discover and pre-bundle deps on first load, sometimes
  // restarting; take that hit before the real runs.
  if (child) {
    const warm = await browser.newPage();
    await warm.goto(baseUrl, { waitUntil: "networkidle", timeout: opts.timeout }).catch(() => {});
    await sleep(1500);
    await warm.close();
  }
  for (const s of opts.scripts) {
    const r = await runScript(browser, path.resolve(s), baseUrl);
    const fpsNote = opts.headed ? "" : " (software WebGL, not representative)";
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} — ${r.screenshots.length} screenshot(s), ${r.errors.length} error(s), ~${r.fps} fps${fpsNote}`);
    if (child && child.exitCode !== null) {
      console.log(`  ✗ the dev server exited during the run:\n${child.getLog().split("\n").slice(-15).join("\n")}`);
    }
    else if (r.errors.some((e) => /ERR_CONNECTION_(REFUSED|RESET)/.test(e))) console.log("  ! connection refused/reset mid-run: the dev server restarted (Vite re-optimizing deps?). Rerun, or build and use --dist.");
    for (const e of r.errors.slice(0, 15)) console.log(`  ✗ ${e}`);
    for (const c of r.checks) {
      if ("pass" in c) console.log(`  ${c.pass ? "✓" : "✗"} expect ${c.expect}${c.pass ? "" : ` → ${JSON.stringify(c.value)}`}`);
      else console.log(`  · ${c.eval} → ${JSON.stringify(c.value)}`);
    }
    for (const s of r.screenshots) console.log(`  ${s.blank ? "✗ BLANK" : "·"} ${s.file} (${s.colors} colours, brightness ${s.brightness})`);
    if (!r.pass) exitCode = 1;
  }
  await browser.close();
} finally {
  killTree(child);
  server?.close();
}
process.exit(exitCode);

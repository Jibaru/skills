#!/usr/bin/env node
/**
 * web_check.mjs — load a three.js / model-viewer page the way a visitor would, wait until it says the
 * model loaded, screenshot it, and fail on console errors.
 *
 *   node web_check.mjs --dir web --page index.html --wait-text "Loaded" --out renders/web.png
 *   node web_check.mjs --url http://localhost:8000/ --wait-selector canvas --out renders/web.png
 *
 * --dir serves a folder on a free port with a built-in static server (glTF/GLB MIME types included), so
 * there's no python http.server to start and forget to stop. GLTFLoader needs http, file:// URLs fail.
 * Uses playwright-core with the system Chrome (no browser download): npm i playwright-core in the folder you
 * run from, or set NODE_PATH. Headless WebGL uses SwiftShader (software); it proves the page works, not FPS.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const dir = opt("dir");
const page_ = opt("page", "index.html");
const waitText = opt("wait-text");
const waitSel = opt("wait-selector", "canvas");
const out = opt("out", "web_check.png");
const timeout = Number(opt("timeout", "60000"));
const size = opt("size", "1440x900").split("x").map(Number);
const chrome = opt("chrome", process.platform === "win32"
  ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
  : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".bin": "application/octet-stream", ".hdr": "application/octet-stream",
  ".ktx2": "image/ktx2", ".mp4": "video/mp4", ".gif": "image/gif", ".wasm": "application/wasm",
};

function serve(root) {
  const base = path.resolve(root);
  const server = http.createServer((req, res) => {
    let file = path.join(base, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(base)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

let pw;
try {
  pw = createRequire(path.resolve("package.json"))("playwright-core");
} catch {
  console.error("web_check: playwright-core not found. Run `npm i playwright-core` here or set NODE_PATH.");
  process.exit(2);
}

let server;
let url = opt("url");
if (dir) ({ server, url } = await serve(dir));
const target = new URL(page_, url).toString();

const browser = await pw.chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon\.ico/.test(r.url())) errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  await page.goto(target, { waitUntil: "load", timeout });
  await page.waitForSelector(waitSel, { timeout });
  if (waitText) {
    await page.waitForFunction((t) => document.body.innerText.includes(t), waitText, { timeout })
      .catch(() => errors.push(`page never showed "${waitText}" within ${timeout} ms`));
  }
  await page.waitForTimeout(1500);                       // a few frames after load, so the model is drawn
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  await page.screenshot({ path: out });
  console.log(`${errors.length ? "FAIL" : "PASS"} ${target} -> ${out}`);
  for (const e of errors) console.log(`  x ${e}`);
  code = errors.length ? 1 : 0;
} catch (e) {
  console.log(`FAIL ${target}: ${e.message.split("\n")[0]}`);
  for (const err of errors) console.log(`  x ${err}`);
  code = 1;
} finally {
  await browser.close();
  server?.close();                                       // the built-in server dies with the script; nothing to clean up
}
process.exit(code);

#!/usr/bin/env node
/**
 * playtest-godot.mjs — run a Godot 4 project under the playtest harness with
 * a scripted input sequence, then report errors, checks and screenshots.
 *
 * The harness runs as the main loop (-s), so the project's scenes and
 * project.godot are never edited. It is copied to <project>/playtest/.
 *
 *   node scripts/playtest-godot.mjs playtest/scripts/smoke.json --project .
 *   node scripts/playtest-godot.mjs playtest/scripts/logic.json --headless
 */

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, "..", "assets", "playtest_harness.gd");

const USAGE = `
playtest-godot — scripted Godot 4 playtest with screenshots

Usage: node playtest-godot.mjs <script.json...> [options]

Options:
  --project <dir>    folder containing project.godot          (default .)
  --godot <path>     Godot 4 binary (else $GODOT, else PATH)
  --headless         no window, no screenshots: logic and error checks only
  --timeout <ms>     kill the run after this long            (default 60000)
`;

const argv = process.argv.slice(2);
const opts = { scripts: [], project: ".", timeout: 60000, headless: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--project") opts.project = argv[++i];
  else if (a === "--godot") opts.godot = argv[++i];
  else if (a === "--headless") opts.headless = true;
  else if (a === "--timeout") opts.timeout = Number(argv[++i]);
  else if (a === "-h" || a === "--help") { console.log(USAGE.trim()); process.exit(0); }
  else opts.scripts.push(a);
}
if (!opts.scripts.length) { console.log(USAGE.trim()); process.exit(1); }

function die(msg) {
  console.error(`playtest-godot: ${msg}`);
  process.exit(1);
}

// ---------------------------------------------------------------- godot binary

function findGodot() {
  const candidates = [opts.godot, process.env.GODOT, process.env.GODOT_BIN, "godot", "godot4", "Godot"].filter(Boolean);
  for (const c of candidates) {
    const r = spawnSync(c, ["--version"], { encoding: "utf8" });
    if (r.status === 0 && /^4\./.test(r.stdout.trim())) return { bin: c, version: r.stdout.trim() };
  }
  die(
    "no Godot 4 binary found. Pass --godot <path> or set GODOT.\n" +
    "  On Windows use the *_console.exe build so output reaches the terminal.\n" +
    "  Download: https://godotengine.org/download",
  );
}

// ---------------------------------------------------------------- run

function run(bin, args, timeout) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      out += `\nPLAYTEST_TIMEOUT after ${timeout} ms`;
      child.kill();
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

// Godot prints engine and script errors as "ERROR: …" / "SCRIPT ERROR: …"
// followed by "   at: …" lines. Keep each error with its location.
function engineErrors(log) {
  const lines = log.split(/\r?\n/);
  const errs = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^(SCRIPT )?ERROR:|^\s*Parse Error:|PLAYTEST_TIMEOUT/.test(lines[i])) {
      const at = /^\s+at:/.test(lines[i + 1] || "") ? ` (${lines[i + 1].trim()})` : "";
      errs.push(lines[i].trim() + at);
    }
  }
  return [...new Set(errs)];
}

const project = path.resolve(opts.project);
if (!fs.existsSync(path.join(project, "project.godot"))) die(`no project.godot in ${project}`);
const { bin, version } = findGodot();

const harnessDest = path.join(project, "playtest", "playtest_harness.gd");
fs.mkdirSync(path.dirname(harnessDest), { recursive: true });
fs.copyFileSync(HARNESS, harnessDest);

// Import once so new assets have their .import files and the run doesn't stall on them.
const imp = await run(bin, ["--headless", "--path", project, "--import"], 5 * 60000);
const importErrors = engineErrors(imp.out);

let exitCode = 0;
for (const s of opts.scripts) {
  const scriptPath = path.resolve(s);
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const name = script.name || path.basename(scriptPath, ".json");
  const outDir = path.join(project, "playtest", "screenshots", name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const args = ["--path", project, "--audio-driver", "Dummy"];
  if (opts.headless) args.push("--headless");
  else if (script.viewport) args.push("--resolution", `${script.viewport[0]}x${script.viewport[1]}`);
  args.push("-s", "res://playtest/playtest_harness.gd", "--", `--playtest=${scriptPath}`, `--out=${outDir}`);

  const { code, out } = await run(bin, args, opts.timeout);
  const reportFile = path.join(outDir, "report.json");
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  } catch {
    report = { name, pass: false, errors: ["harness wrote no report; the game crashed or never loaded"], checks: [], screenshots: [] };
  }
  report.godot = version;
  report.errors = [...importErrors, ...engineErrors(out), ...report.errors];
  if (report.errors.length) report.pass = false;
  if (code !== 0 && report.pass) report.pass = false;
  for (const shot of report.screenshots) {
    shot.file = path.relative(project, shot.file).split(path.sep).join("/");
  }
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "godot.log"), out);

  console.log(`${report.pass ? "PASS" : "FAIL"} ${name} — ${report.screenshots.length} screenshot(s), ${report.errors.length} error(s) [Godot ${version}]`);
  for (const e of report.errors.slice(0, 15)) console.log(`  ✗ ${e}`);
  for (const c of report.checks) {
    if ("pass" in c) console.log(`  ${c.pass ? "✓" : "✗"} expect ${c.expect}${c.pass ? "" : ` → ${c.value}`}`);
    else console.log(`  · ${c.eval} → ${c.value}`);
  }
  for (const sh of report.screenshots) {
    if (sh.skipped) console.log(`  - ${sh.file} skipped: ${sh.skipped}`);
    else console.log(`  ${sh.blank ? "✗ BLANK" : "·"} ${sh.file} (${sh.colors} colours)`);
  }
  if (!report.pass) exitCode = 1;
}
process.exit(exitCode);

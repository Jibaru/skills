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
 *   node scripts/playtest-godot.mjs playtest/scripts/*.json --summary playtest/summary.txt
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, "..", "assets", "playtest_harness.gd");
const LOCK = path.join(os.tmpdir(), "playtest-godot.lock");

const USAGE = `
playtest-godot — scripted Godot 4 playtest with screenshots

Usage: node playtest-godot.mjs <script.json...> [options]

Options:
  --project <dir>    folder containing project.godot          (default .)
  --godot <path>     Godot 4 binary (else $GODOT, else PATH)
  --headless         no window, no screenshots: logic and error checks only
  --timeout <ms>     kill each run after this long   (default: derived from the script)
  --summary <file>   append one line per test as it finishes, plus <file>.json at the end
  --skip-import      don't run the headless import first (assets unchanged since last run)
  --quiet            print only the verdict, failures, warning count and screenshot paths
  --no-lock          skip the one-Godot-per-machine lock (CI with dedicated runners)
  --explain-log <f>  re-classify an existing godot.log into errors and harmless warnings
`;

const argv = process.argv.slice(2);
const opts = { scripts: [], project: ".", headless: false, quiet: false, lock: true, skipImport: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--project") opts.project = argv[++i];
  else if (a === "--godot") opts.godot = argv[++i];
  else if (a === "--headless") opts.headless = true;
  else if (a === "--timeout") opts.timeout = Number(argv[++i]);
  else if (a === "--summary") opts.summary = argv[++i];
  else if (a === "--skip-import") opts.skipImport = true;
  else if (a === "--quiet") opts.quiet = true;
  else if (a === "--no-lock") opts.lock = false;
  else if (a === "--explain-log") opts.explainLog = argv[++i];
  else if (a === "-h" || a === "--help") { console.log(USAGE.trim()); process.exit(0); }
  else opts.scripts.push(a);
}
if (!opts.scripts.length && !opts.explainLog) { console.log(USAGE.trim()); process.exit(1); }

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

// ---------------------------------------------------------------- one Godot at a time

/**
 * A heavy 3D scene takes ~600 MB of VRAM per instance; two Godot processes (two runners, or a
 * runner next to an export or a --write-movie recording) ran a laptop out of memory and the OS
 * killed the background suite with nothing saved. Every runner, including subagents', waits here.
 */
async function acquireLock() {
  let announced = false;
  for (;;) {
    try {
      fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
      return;
    } catch {
      let pid = 0;
      try { pid = Number(fs.readFileSync(LOCK, "utf8")); } catch { continue; }
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch { alive = false; }
      if (!alive || !pid) {
        fs.rmSync(LOCK, { force: true }); // stale: its owner died without cleaning up
        continue;
      }
      if (!announced) {
        console.log(`waiting: playtest pid ${pid} is using Godot (one at a time to avoid running out of memory)`);
        announced = true;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function releaseLock() {
  try {
    if (fs.readFileSync(LOCK, "utf8") === String(process.pid)) fs.rmSync(LOCK, { force: true });
  } catch {}
}

// ---------------------------------------------------------------- run

function run(bin, args, timeout) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      timedOut = true;
      out += `\nPLAYTEST_TIMEOUT after ${timeout} ms`;
      child.kill();
    }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out, timedOut });
    });
  });
}

/**
 * Godot prints these at shutdown when static vars or caches still hold Resources
 * (`static var postfx: ShaderMaterial`, a static event bus). They are not game failures, and
 * treating them as errors made nearly every run FAIL while all checks passed.
 */
const BENIGN = [
  /resources? still in use at exit/i,
  /ObjectDB instances? leaked at exit/i,
  /RID allocations? of type .* (was|were) leaked at exit/i,
  /Leaked instance dependency/i,
];

// Godot prints engine and script errors as "ERROR: …" / "SCRIPT ERROR: …"
// followed by "   at: …" lines. Keep each with its location. Engine messages are localized,
// so match the English prefixes, never the message text.
function engineErrors(log) {
  const lines = log.split(/\r?\n/);
  const errors = [];
  const warnings = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^(SCRIPT )?ERROR:|^\s*Parse Error:/.test(lines[i])) {
      const at = /^\s+at:/.test(lines[i + 1] || "") ? ` (${lines[i + 1].trim()})` : "";
      const msg = lines[i].trim() + at;
      (BENIGN.some((re) => re.test(msg)) ? warnings : errors).push(msg);
    }
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** A budget that fits the script: the waits it declares, plus boot, plus slack. */
function estimateTimeout(script) {
  let ms = 0;
  for (const s of script.steps || []) {
    ms += Number(s.wait || 0) + Number(s.ms || 0) + Number(s.timeout || 0);
    if (s.frames) ms += Number(s.frames) * 50;
    if (s.screenshot) ms += 1500;
  }
  return Math.max(60000, Math.round(120000 + ms * 1.5));
}

/**
 * The first headless import after adding a translation CSV (or similar) prints
 * "Cannot open file 'res://….translation'" for files it creates later in the same pass.
 * A second pass is clean, so errors only count if they survive it.
 */
async function importProject(bin, project) {
  const first = await run(bin, ["--headless", "--path", project, "--import"], 10 * 60000);
  const firstErrors = engineErrors(first.out).errors;
  if (!firstErrors.length) return { errors: [], reimported: false };
  const second = await run(bin, ["--headless", "--path", project, "--import"], 10 * 60000);
  return { errors: engineErrors(second.out).errors, reimported: true };
}

// Re-classify an existing godot.log (an old report, a CI artifact) with the same rules.
if (opts.explainLog) {
  const { errors, warnings } = engineErrors(fs.readFileSync(opts.explainLog, "utf8"));
  for (const e of errors) console.log(`  ✗ ${e}`);
  for (const w of warnings) console.log(`  ! warning: ${w} (harmless)`);
  console.log(`${errors.length} error(s), ${warnings.length} warning(s)`);
  process.exit(errors.length ? 1 : 0);
}

const project = path.resolve(opts.project);
if (!fs.existsSync(path.join(project, "project.godot"))) die(`no project.godot in ${project}`);
const { bin, version } = findGodot();

const harnessDest = path.join(project, "playtest", "playtest_harness.gd");
fs.mkdirSync(path.dirname(harnessDest), { recursive: true });
if (!fs.existsSync(harnessDest) || fs.readFileSync(harnessDest, "utf8") !== fs.readFileSync(HARNESS, "utf8")) {
  fs.copyFileSync(HARNESS, harnessDest);
}
// Godot would import every screenshot PNG as a project texture.
const shotsRoot = path.join(project, "playtest", "screenshots");
fs.mkdirSync(shotsRoot, { recursive: true });
if (!fs.existsSync(path.join(shotsRoot, ".gdignore"))) fs.writeFileSync(path.join(shotsRoot, ".gdignore"), "");

if (opts.lock) {
  process.on("exit", releaseLock);
  for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { releaseLock(); process.exit(130); });
  await acquireLock();
}

let importErrors = [];
if (!opts.skipImport) {
  const imp = await importProject(bin, project);
  importErrors = imp.errors;
  if (imp.reimported && !opts.quiet) {
    console.log(imp.errors.length
      ? `import: ${imp.errors.length} error(s) survived a second import pass`
      : "import: first-pass errors cleared on the second pass (normal after adding translations or new assets)");
  }
}
for (const e of importErrors) console.log(`  ✗ import: ${e}`);

if (opts.summary) fs.mkdirSync(path.dirname(path.resolve(opts.summary)), { recursive: true });
const results = [];
let exitCode = importErrors.length ? 1 : 0;

for (const s of opts.scripts) {
  const scriptPath = path.resolve(s);
  const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
  const name = script.name || path.basename(scriptPath, ".json");
  const outDir = path.join(shotsRoot, name);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const timeout = opts.timeout ?? script.timeout ?? estimateTimeout(script);

  const args = ["--path", project, "--audio-driver", "Dummy"];
  if (opts.headless) args.push("--headless");
  else if (script.viewport) args.push("--resolution", `${script.viewport[0]}x${script.viewport[1]}`);
  args.push("-s", "res://playtest/playtest_harness.gd", "--", `--playtest=${scriptPath}`, `--out=${outDir}`);

  const started = Date.now();
  const { code, out, timedOut } = await run(bin, args, timeout);
  const reportFile = path.join(outDir, "report.json");
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
  } catch {
    report = { name, pass: false, errors: [], warnings: [], checks: [], screenshots: [] };
  }
  report.warnings ??= [];
  const engine = engineErrors(out);

  if (timedOut) {
    const last = [...out.matchAll(/^PLAYTEST_STEP (\d+)\/(\d+) (.*)$/gm)].pop();
    report.errors.push(
      `killed by the runner after ${timeout} ms at step ${last?.[1] ?? 0}/${last?.[2] ?? "?"} ${last?.[3] ?? "(before the first step)"}` +
      ` — if the script is just long, pass --timeout <ms> or set "timeout" in the JSON; if not, the game is waiting for input the script never sends`,
    );
  } else if (!fs.existsSync(reportFile)) {
    report.errors.push("harness wrote no report: the game crashed or never loaded (see godot.log)");
  }

  report.godot = version;
  report.errors = [...engine.errors, ...report.errors];
  report.warnings = [...new Set([...report.warnings, ...engine.warnings])];
  // Warnings never fail a run; errors, failed checks, blank frames and a nonzero exit do.
  report.pass = code === 0 && report.errors.length === 0 &&
    !report.checks.some((c) => c.pass === false) && !report.screenshots.some((sh) => sh.blank);
  for (const shot of report.screenshots) shot.file = path.relative(project, shot.file).split(path.sep).join("/");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(outDir, "godot.log"), out);

  printReport(report, name, Date.now() - started);
  results.push({ name, pass: report.pass, errors: report.errors.length, warnings: report.warnings.length, screenshots: report.screenshots.length });
  if (opts.summary) {
    fs.appendFileSync(
      opts.summary,
      `${report.pass ? "PASS" : "FAIL"}  ${name}  shots=${report.screenshots.length} errors=${report.errors.length} warnings=${report.warnings.length}` +
      `${report.errors[0] ? "  first: " + report.errors[0] : ""}\n`,
    );
  }
  if (!report.pass) exitCode = 1;
}

if (opts.scripts.length > 1 || opts.summary) {
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (opts.summary) {
    fs.writeFileSync(`${opts.summary.replace(/\.txt$/, "")}.json`, JSON.stringify({ godot: version, passed, total: results.length, results }, null, 2) + "\n");
  }
}
process.exit(exitCode);

// ---------------------------------------------------------------- output

function printReport(report, name, ms) {
  const secs = Math.round(ms / 1000);
  console.log(`${report.pass ? "PASS" : "FAIL"} ${name} — ${report.screenshots.length} screenshot(s), ${report.errors.length} error(s), ${report.warnings.length} warning(s), ${secs}s [Godot ${version}]`);
  for (const e of report.errors.slice(0, 15)) console.log(`  ✗ ${e}`);
  if (!opts.quiet) for (const w of report.warnings) console.log(`  ! warning: ${w} (harmless)`);
  const oneLine = (s) => String(s).replace(/\s*\n\s*/g, " ⏎ ");
  for (const c of report.checks) {
    const bad = /^(PARSE|EXEC|COMPILE) ERROR$/.test(String(c.value));
    if ("gd" in c) c.gd = oneLine(c.gd);
    c.value = oneLine(c.value);
    if ("pass" in c) {
      if (!c.pass) console.log(`  ✗ expect ${c.expect} → ${c.value}`);
      else if (!opts.quiet) console.log(`  ✓ expect ${c.expect}`);
    } else if (bad) {
      console.log(`  ✗ ${c.eval ?? c.gd} → ${c.value} (this step did nothing; later results are invalid)`);
    } else if (!opts.quiet) {
      console.log(`  · ${c.eval ?? c.gd} → ${c.value}`);
    }
  }
  for (const sh of report.screenshots) {
    if (sh.skipped) { if (!opts.quiet) console.log(`  - ${sh.file} skipped: ${sh.skipped}`); continue; }
    const flag = sh.blank ? "✗ BLANK" : sh.same_as_previous ? "= SAME as previous (did the step before it change anything?)" : "·";
    console.log(`  ${flag} ${sh.file} (${sh.colors} colours)`);
  }
}

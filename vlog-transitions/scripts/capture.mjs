#!/usr/bin/env node
// capture.mjs — fallback render pipeline: agent-browser frame-by-frame capture.
//
//   node scripts/capture.mjs <transition-dir> [--width 3840] [--height 2160]
//                            [--out out/name.mp4] [--fps N] [--keep-frames]
//
// Use this when Remotion gets in the way. It drives the exact same
// template.html: opens it over file://, sets the viewport, then for every
// frame calls seek(t) via `agent-browser eval` and takes a screenshot; ffmpeg
// assembles the sequence into H.264. Output is opaque only — for alpha
// (ProRes 4444) use the Remotion pipeline.
//
// Requires: agent-browser (npm i -g agent-browser && agent-browser install), ffmpeg.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const projDir = resolve(positional[0] ?? '.');
const configPath = join(projDir, 'transition.config.json');
if (!existsSync(configPath)) {
  console.error(`no transition.config.json in ${projDir}`);
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const width = parseInt(flag('width', String(config.size.width)), 10);
const height = parseInt(flag('height', String(config.size.height)), 10);
const fps = parseInt(flag('fps', String(config.fps)), 10);
const out = resolve(projDir, flag('out', join('out', `${config.name}-capture.mp4`)));
const totalFrames = Math.round(config.durationSeconds * fps);

// Keep transition.config.js in sync with the JSON.
writeFileSync(
  join(projDir, 'transition.config.js'),
  '// generated from transition.config.json — edit the JSON, then re-run stage.mjs\n' +
    `window.TRANSITION_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);

const framesDir = join(projDir, 'out', 'frames');
rmSync(framesDir, {recursive: true, force: true});
mkdirSync(framesDir, {recursive: true});

const ab = (...a) => execFileSync('agent-browser', a, {encoding: 'utf8'}).trim();

console.log(`capturing ${totalFrames} frames at ${width}x${height}@${fps} ...`);
ab('open', pathToFileURL(join(projDir, 'template.html')).href);
ab('set', 'viewport', String(width), String(height));

// Wait until the template reports READY (fonts + stickers loaded).
for (let i = 0; i < 100; i++) {
  if (ab('eval', 'window.READY === true') === 'true') break;
  if (i === 99) {
    console.error('template never became READY — check template.html in a browser (#dev)');
    process.exit(1);
  }
  execFileSync('sleep', ['0.1']);
}

for (let f = 0; f < totalFrames; f++) {
  const t = f / fps;
  ab('eval', `window.seek(${t})`);
  ab('screenshot', join(framesDir, `f_${String(f).padStart(5, '0')}.png`));
  if (f % fps === 0) console.log(`  ${f}/${totalFrames}`);
}
ab('close');

console.log('assembling with ffmpeg ...');
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-framerate', String(fps),
    '-i', join(framesDir, 'f_%05d.png'),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    out,
  ],
  {stdio: 'inherit'}
);

if (!args.includes('--keep-frames')) {
  rmSync(framesDir, {recursive: true, force: true});
}
console.log(`done: ${out}`);

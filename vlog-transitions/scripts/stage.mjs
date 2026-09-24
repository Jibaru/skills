#!/usr/bin/env node
// stage.mjs — sync a transition project into the shared Remotion renderer.
//
//   node scripts/stage.mjs <transition-dir>
//
// Regenerates transition.config.js from transition.config.json, copies the
// project into <workspace>/_renderer/public/current/ and updates
// src/current-config.json (composition size/fps/duration). Run it after every
// config or template edit, before rendering.
import {cpSync, existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';

const projDir = resolve(process.argv[2] ?? '.');
const configPath = join(projDir, 'transition.config.json');
if (!existsSync(configPath)) {
  console.error(`no transition.config.json in ${projDir}`);
  process.exit(1);
}
const rendererDir = resolve(projDir, '..', '_renderer');
if (!existsSync(rendererDir)) {
  console.error(`no _renderer next to the project (expected ${rendererDir}) — run scaffold.mjs first`);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));

writeFileSync(
  join(projDir, 'transition.config.js'),
  '// generated from transition.config.json — edit the JSON, then re-run stage.mjs\n' +
    `window.TRANSITION_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);

const current = join(rendererDir, 'public', 'current');
rmSync(current, {recursive: true, force: true});
cpSync(projDir, current, {
  recursive: true,
  filter: (src) => !src.includes(`${join(projDir, 'out')}`),
});

writeFileSync(join(rendererDir, 'src', 'current-config.json'), JSON.stringify(config, null, 2) + '\n');

const out = join(projDir, 'out', `${config.name}.mp4`);
console.log(`staged ${config.name} -> ${current}`);
console.log('render commands (run inside _renderer):');
console.log(`  npx remotion render Transition "${out}"                       # final 4K`);
console.log(`  npx remotion render Transition "${join(projDir, 'out', 'preview.mp4')}" --scale=0.3333 --crf=28   # 720p preview`);
console.log(`  npm run render-alpha -- "${join(projDir, 'out', `${config.name}-alpha.mov`)}"   # ProRes 4444 with alpha`);

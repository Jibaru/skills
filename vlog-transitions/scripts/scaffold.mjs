#!/usr/bin/env node
// scaffold.mjs — create the transitions workspace and a new transition project.
//
//   node scripts/scaffold.mjs --template map-reveal --name lima-intro [--dir ./transitions] [--force]
//
// Layout it produces:
//   <dir>/_renderer/          shared Remotion runtime (copied once; npm install once)
//   <dir>/<name>/
//     template.html           animation source of truth (edit map art here)
//     animation.js            deterministic seek(t) choreography
//     motion.js               shared helpers
//     transition.config.json  every parameter; regenerating = re-running from this
//     transition.config.js    generated from the JSON (do not edit by hand)
//     assets/fonts/           bundled handwritten font
//     assets/                 photos + processed stickers
//     out/                    rendered videos
import {cpSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const template = flag('template');
const name = flag('name');
const dir = resolve(flag('dir', './transitions'));
const force = args.includes('--force');

const templates = ['map-reveal', 'map-travel'];
if (!template || !templates.includes(template) || !name) {
  console.error(`Usage: node scripts/scaffold.mjs --template <${templates.join('|')}> --name <name> [--dir ./transitions] [--force]`);
  process.exit(1);
}

// 1. Shared renderer (once per workspace).
const rendererDir = join(dir, '_renderer');
if (!existsSync(rendererDir)) {
  cpSync(join(skillRoot, 'assets', 'renderer'), rendererDir, {recursive: true});
  mkdirSync(join(rendererDir, 'public'), {recursive: true});
  console.log(`created ${rendererDir} — run "npm install" inside it once`);
} else {
  console.log(`renderer already present: ${rendererDir}`);
}

// 2. The transition project.
const projDir = join(dir, name);
if (existsSync(projDir) && !force) {
  console.error(`${projDir} already exists (use --force to overwrite its template files)`);
  process.exit(1);
}
mkdirSync(join(projDir, 'assets', 'fonts'), {recursive: true});
mkdirSync(join(projDir, 'out'), {recursive: true});

const tplDir = join(skillRoot, 'assets', 'templates', template);
cpSync(join(tplDir, 'template.html'), join(projDir, 'template.html'));
cpSync(join(tplDir, 'animation.js'), join(projDir, 'animation.js'));
cpSync(join(skillRoot, 'assets', 'templates', 'shared', 'motion.js'), join(projDir, 'motion.js'));
cpSync(join(skillRoot, 'assets', 'fonts'), join(projDir, 'assets', 'fonts'), {recursive: true});

const configPath = join(projDir, 'transition.config.json');
if (!existsSync(configPath) || force) {
  const config = JSON.parse(readFileSync(join(tplDir, 'transition.config.json'), 'utf8'));
  config.name = name;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

// 3. Generated config.js so template.html works standalone (file:// + iframe).
const config = JSON.parse(readFileSync(configPath, 'utf8'));
writeFileSync(
  join(projDir, 'transition.config.js'),
  '// generated from transition.config.json — edit the JSON, then re-run stage.mjs\n' +
    `window.TRANSITION_CONFIG = ${JSON.stringify(config, null, 2)};\n`
);

console.log(`\nscaffolded ${projDir} (template: ${template})`);
console.log('next steps:');
console.log(`  1. edit ${configPath} (locations, durations, stickers)`);
console.log(`  2. draw the map art inside <g id="map-art"> in template.html`);
console.log(`  3. process stickers:  node ${join(rendererDir, 'tools', 'sticker.mjs')} photo.jpg ${join(projDir, 'assets')}/face.sticker.png`);
console.log(`  4. stage + render:    node ${join(skillRoot, 'scripts', 'stage.mjs')} ${projDir}`);

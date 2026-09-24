#!/usr/bin/env node
// sticker.mjs — turn a photo into a cut-out sticker with a white die-cut border.
//
//   node tools/sticker.mjs <input.jpg|png> <output.png> [--border 26] [--no-cut]
//
// Pipeline: background removal (@imgly/background-removal-node, downloads its
// model on first run) -> white border via ImageMagick alpha dilation. Drop
// shadow is intentionally NOT baked in: the templates apply it with CSS
// (filter: drop-shadow) so it stays style-pack controlled.
//
// --no-cut skips background removal for photos that are already transparent
// PNGs (the manual-cutout fallback).
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync, copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

if (positional.length < 2) {
  console.error('Usage: node tools/sticker.mjs <input> <output.png> [--border 26] [--no-cut]');
  process.exit(1);
}

const [input, output] = positional.map((p) => resolve(p));
const border = parseInt(flag('border', '26'), 10);
const work = mkdtempSync(join(tmpdir(), 'sticker-'));
const cut = join(work, 'cut.png');

try {
  if (has('no-cut')) {
    copyFileSync(input, cut);
  } else {
    const {removeBackground} = await import('@imgly/background-removal-node');
    const blob = await removeBackground(pathToFileURL(input).href);
    writeFileSync(cut, Buffer.from(await blob.arrayBuffer()));
    console.log('background removed');
  }

  // White die-cut border: dilate the alpha into a white shape underneath.
  execFileSync('magick', [
    cut,
    '-bordercolor', 'none',
    '-border', String(border + 4),
    '(', '+clone', '-alpha', 'extract',
         '-morphology', 'dilate', `disk:${border}`,
         '-blur', '0x1', '-level', '40%,60%',
         '-background', 'white', '-alpha', 'shape', ')',
    '-compose', 'DstOver', '-composite',
    '-trim', '+repage',
    output,
  ], {stdio: 'inherit'});

  console.log(`sticker written: ${output}`);
} finally {
  rmSync(work, {recursive: true, force: true});
}

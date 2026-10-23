/**
 * The lump commands that are thin wrappers around the slidev CLI:
 *
 * - `lump start <deck.md>` serves a deck live, for editing
 * - `lump slides2website <deck.md> -o <out-folder>` builds the deck to a static website
 *
 * @module
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { LumpError, splitFrontmatter } from '../lib/config.ts';
import { SLIDEV_BIN, themeArgs } from '../lib/slidev.ts';
import type { Command } from '../lib/command.ts';

/**
 * Run lump's copy of slidev on a deck, with the terminal attached, so slidev's
 * output (and, for the dev server, its keyboard shortcuts) work as if it were
 * run directly.
 *
 * @param deck     The deck's absolute path.
 * @param args     The arguments to pass to slidev, after the deck's path.
 * @param defaults Settings for the deck, unless it sets them itself (see `themeArgs`).
 *
 * @returns A promise of slidev's exit status, once it exits.
 *
 * @throws {LumpError} If the deck's theme is not installed (see `themeArgs`).
 */
function runSlidev(deck: string, args: string[], defaults: Record<string, unknown> = {}): Promise<number> {
  const all = [...args, ...themeArgs(deck, defaults)];
  return new Promise((resolve) => {
    const child = spawn(SLIDEV_BIN, all, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

/**
 * `lump start <deck.md>`: serve a deck with slidev's dev server and open it
 * in the browser. Edits to the deck show up live; press Ctrl-C to stop.
 */
export const start: Command = {
  name: 'start',
  arg: '<deck.md>',
  summary: 'Serve a deck live in the browser, for editing',
  async run({ file, name }) {
    console.log(`Serving ${name} ...`);
    return runSlidev(file, [file, '--open']);
  },
};

/**
 * `lump slides2website <deck.md> -o <out-folder>`: build a deck into a static
 * website in a folder.
 *
 * The site can be put anywhere on a web server, at any depth, and under any
 * name, with no server settings: all of its paths are relative to its own
 * `index.html`, and the slides are addressed by the part of the URL after `#`
 * (`.../talk/#/3`), which the server never sees. (So a deck must not set its
 * own `routerMode`.)
 *
 * The build replaces what is in the folder, so lump only builds into a folder
 * that is empty, new, or a website built before (it has an `index.html`), and
 * never one that contains the deck.
 */
export const slides2website: Command = {
  name: 'slides2website',
  arg: '<deck.md>',
  output: '<out-folder>',
  summary: 'Slidev deck -> static website in a folder (put it anywhere)',
  async run({ file, name, out }) {
    const { data } = splitFrontmatter(fs.readFileSync(file, 'utf8'), file);
    if (data.routerMode !== undefined && data.routerMode !== 'hash') {
      throw new LumpError(`${file} sets routerMode to "${data.routerMode}", but a website lump builds needs "hash" (or no setting).`);
    }
    const outside = path.relative(out, file);
    if (!outside.startsWith('..') && !path.isAbsolute(outside)) {
      throw new LumpError(`${out} contains the deck (${file}), and building would replace everything in it.`);
    }
    if (fs.existsSync(out)) {
      if (!fs.statSync(out).isDirectory()) throw new LumpError(`${out} is a file, but slides2website writes a folder.`);
      const entries = fs.readdirSync(out);
      if (entries.length && !entries.includes('index.html')) {
        throw new LumpError(`${out} is not empty and is not a website built before (it has no index.html), so lump will not replace its contents.`);
      }
    }
    console.log(`Building ${name} -> ${out} ...`);
    const status = await runSlidev(file, ['build', file, '--out', out, '--base', './'], { routerMode: 'hash' });
    // Slidev also writes the page-rewrite files that a site with ordinary URLs needs from its web server (here, with
    // slides addressed after the `#`, they would only get in the way)
    for (const leftover of ['_redirects', '404.html']) fs.rmSync(path.join(out, leftover), { force: true });
    return status;
  },
};

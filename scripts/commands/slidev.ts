/**
 * The lump commands that are thin wrappers around the slidev CLI:
 *
 * - `lump start <deck.md>` serves a deck live, for editing
 * - `lump slides2website <deck.md>` builds the deck to `out/<deck>/`
 *
 * @module
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { OUT_DIR } from '../lib/config.ts';
import type { Command } from '../lib/command.ts';

/**
 * Run `npx slidev` with the terminal attached, so slidev's output (and, for the
 * dev server, its keyboard shortcuts) work as if it were run directly.
 *
 * @param args The arguments to pass to slidev.
 *
 * @returns A promise of slidev's exit status, once it exits.
 */
function runSlidev(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['slidev', ...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
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
    return runSlidev([file, '--open']);
  },
};

/**
 * `lump slides2website <deck.md>`: build a deck into a static website in
 * `out/<deck>/`.
 *
 * The site expects to be served from the `/<deck>/` path of a web server
 * (e.g. `https://example.edu/<deck>/`), so that several decks can share one
 * server.
 */
export const slides2website: Command = {
  name: 'slides2website',
  arg: '<deck.md>',
  summary: 'Slidev deck -> out/<deck>/ as a static website',
  async run({ file, name }) {
    console.log(`Building ${name} -> out/${name}/ ...`);
    return runSlidev(['build', file, '--out', path.join(OUT_DIR, name), '--base', `/${name}/`]);
  },
};

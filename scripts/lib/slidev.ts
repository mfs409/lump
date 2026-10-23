/**
 * How lump runs slidev, for every command that needs it.
 *
 * lump is meant to be linked (`npm link`) and run from any folder, so a deck's folder has neither slidev nor the
 * deck's theme in a `node_modules`, and nothing of lump's (its player, page numbers, styles) in the folder
 * either. So lump runs its own copy of slidev, and gives it two things on the command line:
 *
 * - the deck's theme, looked for first in the deck's folder (and the folders above it), where it can be installed
 *   with `npm install`, and then in lump's own `node_modules`, which has `academic`
 * - lump's addon (`slidev/` in lump's folder), added to every deck
 *
 * Slidev takes one theme on the command line, and adds addons only from a deck's settings, so both go in a small
 * "wrapper" theme that lump writes to a temporary folder: it has the deck's real theme's settings, and lists the real
 * theme and lump's addon as addons (slidev gives a theme's and an addon's files, such as layouts and styles, the same
 * treatment).
 *
 * @module
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LumpError, ROOT, splitFrontmatter } from './config.ts';

/** lump's copy of slidev */
export const SLIDEV_BIN = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'slidev.cmd' : 'slidev');

/** lump's slidev addon: the Manim player, page numbers, buttons, default styles */
const ADDON_DIR = path.join(ROOT, 'slidev');

/** The package names slidev tries for a theme called `name`, in its order */
const themePackages = (name: string) => [`@slidev/theme-${name}`, `slidev-theme-${name}`, name];

/** The folders to look in for `node_modules/<package>`: the deck's folder and each one above it, then lump's */
function searchFolders(deckDir: string): string[] {
  const folders: string[] = [];
  for (let dir = deckDir; ; dir = path.dirname(dir)) {
    folders.push(dir);
    if (path.dirname(dir) === dir) break;
  }
  folders.push(ROOT);
  return folders;
}

/**
 * Find a deck's theme.
 *
 * @param name    The `theme:` setting of the deck (a package name such as `academic`, or a path).
 * @param deckDir The deck's folder.
 *
 * @returns The folder of the theme's package.
 *
 * @throws {LumpError} If it is not installed.
 */
function findTheme(name: string, deckDir: string): string {
  if (name.startsWith('.') || path.isAbsolute(name) || (!name.startsWith('@') && name.includes('/'))) {
    const dir = path.resolve(deckDir, name);
    if (!fs.existsSync(path.join(dir, 'package.json'))) throw new LumpError(`The theme folder ${dir} has no package.json.`);
    return dir;
  }
  const names = name.startsWith('@slidev/theme-') || name.startsWith('slidev-theme-') ? [name] : themePackages(name);
  for (const folder of searchFolders(deckDir)) {
    for (const pkg of names) {
      const dir = path.join(folder, 'node_modules', pkg);
      if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    }
  }
  const pkg = names.find((n) => n.startsWith('slidev-theme-')) ?? names[0];
  throw new LumpError(
    `The theme "${name}" (package ${pkg}) is not installed.\nInstall it in the deck's folder with:  npm install ${pkg}`
  );
}

/**
 * The slidev command-line arguments that give a deck its theme and lump's addon.
 *
 * @param deckPath Absolute path to the deck.
 * @param defaults Settings to use for the deck unless its own settings say otherwise (the wrapper theme's
 *                 `defaults`; a deck's front matter takes precedence over them).
 *
 * @returns `['--theme', <folder of the wrapper theme>]`.
 *
 * @throws {LumpError} If the deck's theme is not installed, or the deck lists its own addons (slidev would then not
 *         see lump's).
 */
export function themeArgs(deckPath: string, defaults: Record<string, unknown> = {}): string[] {
  const { data } = splitFrontmatter(fs.readFileSync(deckPath, 'utf8'), deckPath);
  if (data.addons !== undefined) {
    throw new LumpError(
      `${deckPath} has an "addons" setting, which would replace the addon lump adds to every deck.\nRemove that setting.`
    );
  }
  // `theme: none` or `theme:` with nothing after it means no theme; no `theme` setting means slidev's default
  const setting = data.theme === undefined ? 'default' : data.theme === null ? 'none' : String(data.theme);
  const addons = [ADDON_DIR];
  let meta: Record<string, any> = {};
  if (setting !== 'none') {
    const themeDir = findTheme(setting, path.dirname(deckPath));
    addons.unshift(themeDir);
    meta = JSON.parse(fs.readFileSync(path.join(themeDir, 'package.json'), 'utf8')).slidev ?? {};
  }

  // The wrapper: the real theme's settings (colors, fonts, ...), and the addons
  const wrapper = {
    name: 'lump-wrapper-theme',
    version: '1.0.0',
    slidev: { ...meta, defaults: { ...meta.defaults, ...defaults, addons } },
  };
  const dir = path.join(os.tmpdir(), 'lump-themes', createHash('sha1').update(JSON.stringify(wrapper)).digest('hex').slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(wrapper, null, 2));
  return ['--theme', dir];
}

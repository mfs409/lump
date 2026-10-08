/**
 * Shared settings and helpers for all lump commands.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** The project's root folder (the one containing `package.json`). */
export const ROOT = path.join(import.meta.dirname, '..', '..');

/** Where every command writes its output: `out/` in the project root. */
export const OUT_DIR = path.join(ROOT, 'out');

/** The stylesheet for the slides, which also holds the default accent color. */
export const STYLE_CSS = path.join(ROOT, 'slides', 'style.css');

/**
 * An error whose message is meant for the user, such as a missing file or a
 * missing program. lump prints just the message (no stack trace) and exits
 * with status 1.
 */
export class LumpError extends Error {}

/**
 * A Markdown file split into its frontmatter and its content.
 */
export interface Frontmatter {
  /** The settings from the frontmatter block (empty if there is none). */
  data: Record<string, unknown>;

  /** The rest of the file, after the frontmatter block. */
  body: string;
}

/**
 * Split a Markdown file into its frontmatter and its content.
 *
 * The frontmatter is an optional block of YAML settings at the very top of
 * the file, between two `---` lines (as in Slidev decks).
 *
 * @param source   The file's Markdown text.
 * @param filePath The file's path, for error messages.
 *
 * @returns The parsed settings, and the text after the block.
 *
 * @throws {LumpError} If the frontmatter isn't valid YAML.
 */
export function splitFrontmatter(source: string, filePath: string): Frontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return { data: {}, body: source };
  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch (err) {
    throw new LumpError(`The settings block at the top of ${filePath} is not valid YAML:\n${(err as Error).message}`);
  }
  return { data: (data ?? {}) as Record<string, unknown>, body: source.slice(match[0].length) };
}

/**
 * The default accent color, for files whose frontmatter doesn't set one.
 *
 * It is read from the `--slidev-theme-primary: <color>;` line in
 * `slides/style.css`, which is also the default color of the slides.
 *
 * @returns The color, exactly as written in the CSS (e.g. `#502d0e`).
 *
 * @throws {LumpError} If `slides/style.css` is missing or has no such line.
 */
function defaultAccentColor(): string {
  // Comments are removed first, so a commented-out line doesn't count
  const css = (fs.existsSync(STYLE_CSS) ? fs.readFileSync(STYLE_CSS, 'utf8') : '').replace(/\/\*[\s\S]*?\*\//g, '');
  const match = css.match(/--slidev-theme-primary\s*:\s*([^;}]+?)\s*[;}]/);
  if (!match) {
    throw new LumpError(
      `Could not find the accent color in ${STYLE_CSS}.\nIt should contain a line like:  --slidev-theme-primary: #502d0e;`
    );
  }
  return match[1];
}

/**
 * The accent color for a document or deck (title underline, links, and on
 * slides, titles and page numbers).
 *
 * A file sets it in its frontmatter, the same way Slidev does for decks:
 *
 * ```yaml
 * themeConfig:
 *   primary: '#502d0e'
 * ```
 *
 * Otherwise it is the default from `slides/style.css`.
 *
 * @param data     The file's frontmatter settings.
 * @param filePath The file's path, for error messages.
 *
 * @returns The color, e.g. `#502d0e`.
 *
 * @throws {LumpError} If `primary` is set but empty (usually because the color
 *         wasn't quoted, so YAML read its `#` as the start of a comment), or if
 *         there is no default (see {@link defaultAccentColor}).
 */
export function accentColor(data: Record<string, unknown>, filePath: string): string {
  const themeConfig = data.themeConfig as Record<string, unknown> | undefined;
  if (themeConfig && typeof themeConfig === 'object' && 'primary' in themeConfig) {
    const primary = themeConfig.primary;
    if (typeof primary !== 'string' || !primary.trim()) {
      throw new LumpError(
        `The themeConfig primary color in ${filePath} is empty.\nColors must be quoted, because # starts a comment in YAML:  primary: '#502d0e'`
      );
    }
    return primary.trim();
  }
  return defaultAccentColor();
}

/**
 * Where {@link findChrome} looks for Chrome/Chromium, in order: the
 * `CHROME_PATH` environment variable (when set), then the usual install
 * locations on Linux, macOS and Windows.
 *
 * NB: The `filter` removes process.env.CHROME_PATH when it's not set
 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter((p): p is string => Boolean(p));

/**
 * Finds a system Chrome or Chromium.
 *
 * @returns The path to the first of {@link CHROME_CANDIDATES} that exists.
 * @throws {LumpError} If none exists; the message lists the places searched
 *   and mentions `CHROME_PATH`.
 */
export function findChrome(): string {
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new LumpError(
      `No system Chrome/Chromium found. Install one, or set CHROME_PATH to its executable.\nLooked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`
    );
  }
  return found;
}

/**
 * Splits a Slidev deck into its slides.
 *
 * Slides are the segments between lone `---` lines that contain a `# `
 * title. Segments without one are a slide's own settings (e.g. `layout:`),
 * not slides, so they are dropped.
 *
 * @param body The deck's Markdown text after its frontmatter (see
 *             {@link splitFrontmatter}), so that a YAML comment there isn't
 *             mistaken for a slide title.
 * @returns Each slide's Markdown text, in order.
 */
export function deckSlides(body: string): string[] {
  return body.split(/\r?\n---\r?\n/).filter((seg) => /^#\s+.+$/m.test(seg));
}

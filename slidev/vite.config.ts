/**
 * Vite config for lump's addon, merged into slidev's (slidev loads `vite.config.ts` from every root: the theme, the
 * addons, and the deck's folder).
 *
 * - `lump-manim/<file>` names lump's generic Manim code (`manim/<file>.ts` here), so a deck's own scenes can import it
 *   without lump having to be installed in the deck's folder.
 * - A bare import in a file of the deck's folder that Vite can't find there (say `manim-web`) is looked for in lump's
 *   own `node_modules`, since lump is linked, not installed, in the deck's folder.
 * - The dev-server endpoint behind the "duplicate slide" and "new blank slide" buttons in `custom-nav-controls.vue`.
 *   The endpoint edits the deck's Markdown file; slidev's file watcher then reloads the slides.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from '@slidev/parser/fs';
import type { Plugin } from 'vite';

const ENDPOINT = '/__lump/insert-slide';

/** This folder (lump's `slidev/`), and lump's root */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LUMP_ROOT = path.dirname(HERE);

/** lump's copy of manim-web, found from here (a deck's folder has none) */
const MANIM_WEB = fileURLToPath(import.meta.resolve('manim-web'));

/** Whether an import names a package (not a path, or one of vite's own `/@id/`, `\0` or `node:` ids) */
const isBare = (id: string) => !/^([./\0]|[a-z]+:|\/@)/i.test(id) && !path.isAbsolute(id);

/** What the blank slide contains. It needs a non-empty title for lump's scripts. */
const BLANK_SLIDE = ['# &nbsp;'];

/** The deck being served: the `.md` argument slidev was started with. */
function deckPath(): string | undefined {
  const arg = process.argv.slice(2).find((a) => a.endsWith('.md'));
  return arg && path.resolve(arg);
}

function insertSlide(deck: string, no: number, kind: 'duplicate' | 'blank') {
  return load(path.dirname(deck), deck).then((data) => {
    const slide = data.slides[no - 1]?.source;
    if (!slide) throw new Error(`no slide ${no}`);
    const file = slide.filepath;
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    // slide.start/contentStart/end are 0-based line numbers; `end` is the
    // line of the `---` that follows the slide (or past the last line).
    let body: string[];
    if (kind === 'blank') body = BLANK_SLIDE;
    else if (slide.index === 0) body = lines.slice(slide.contentStart, slide.end); // skip the deck's headmatter
    else body = lines.slice(slide.start, slide.end); // includes slide's own frontmatter
    while (body.length && body[0].trim() === '') body.shift();
    while (body.length && body[body.length - 1].trim() === '') body.pop();

    const block = ['---', '', ...body, ''];
    if (slide.end >= lines.length) {
      // Last slide: no trailing separator to insert before.
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push('', ...block.slice(0, -1), '');
    } else {
      lines.splice(slide.end, 0, ...block);
    }
    fs.writeFileSync(file, lines.join('\n'));
  });
}

export default {
  resolve: {
    alias: { 'lump-manim': path.join(HERE, 'manim'), 'manim-web': MANIM_WEB },
  },
  // Prepare manim-web at start-up. Found late (on the first slide that shows an animation), vite would prepare it
  // then and reload the page, and until the page is reloaded again it can end up with two copies of vue.
  optimizeDeps: { include: ['manim-web'] },
  plugins: [
    {
      name: 'lump:resolve-from-lump',
      async resolveId(source, importer, options) {
        // (runs only when vite's own resolver found nothing)
        if (!importer || !isBare(source) || importer.startsWith(LUMP_ROOT + path.sep)) return null;
        return this.resolve(source, path.join(LUMP_ROOT, 'package.json'), { ...options, skipSelf: true });
      },
    } satisfies Plugin,
    {
      name: 'lump:insert-slide',
      configureServer(server) {
        server.middlewares.use(ENDPOINT, (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            return res.end();
          }
          let raw = '';
          req.on('data', (c) => (raw += c));
          req.on('end', async () => {
            try {
              const { no, kind } = JSON.parse(raw);
              const deck = deckPath();
              if (!deck || !Number.isInteger(no) || !['duplicate', 'blank'].includes(kind))
                throw new Error('bad request');
              await insertSlide(deck, no, kind);
              res.statusCode = 200;
              res.end('ok');
            } catch (e) {
              console.error('lump: insert-slide failed:', e);
              res.statusCode = 500;
              res.end(String(e));
            }
          });
        });
      },
    } satisfies Plugin,
  ],
};

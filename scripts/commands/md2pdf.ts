/**
 * `lump md2pdf <file.md>`: print a plain Markdown document to `out/<file>.pdf`,
 * on 8.5 x 11 pages.
 *
 * @module
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { OUT_DIR, accentColor, splitFrontmatter } from '../lib/config.ts';
import { createMarkdown } from '../lib/markdown.ts';
import { renderPage } from '../lib/templates.ts';
import { printToPdf } from '../lib/chrome.ts';
import type { Command } from '../lib/command.ts';

/** The `md2pdf` command for printing a Markdown document as PDF */
export const md2pdf: Command = {
  name: 'md2pdf',
  arg: '<file.md>',
  summary: 'Plain Markdown document -> out/<file>.pdf (8.5 x 11)',
  async run({ file: inputPath, name }) {
    // The frontmatter block (if any) holds settings, such as the accent
    // color; the rest is the document
    const source = fs.readFileSync(inputPath, 'utf8');
    const { data, body } = splitFrontmatter(source, inputPath);
    const md = await createMarkdown(body);

    // The page title is the document's first "# " heading, or else its file
    // name
    const titleMatch = body.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : name;

    const html = renderPage('document', accentColor(data, inputPath), {
      title,
      contentHtml: md.render(body),
      // The page is printed from out/, so relative links and images (e.g.
      // images/foo.svg) are resolved from the document's own folder instead
      baseHref: pathToFileURL(path.dirname(inputPath) + path.sep).href,
    });

    // Save the page as a temporary file, print it, and delete it (even if
    // printing fails)
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const htmlPath = path.join(OUT_DIR, `${name}.tmp.html`);
    const outPath = path.join(OUT_DIR, `${name}.pdf`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    try {
      return printToPdf(htmlPath, outPath);
    } finally {
      fs.unlinkSync(htmlPath);
    }
  },
};

/**
 * `lump md2pdf <file.md> -o <out.pdf>`: print a plain Markdown document to a PDF,
 * on 8.5 x 11 pages.
 *
 * @module
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { accentColor, splitFrontmatter } from '../lib/config.ts';
import { createMarkdown } from '../lib/markdown.ts';
import { renderPage } from '../lib/templates.ts';
import { printToPdf } from '../lib/chrome.ts';
import type { Command } from '../lib/command.ts';

/** The `md2pdf` command for printing a Markdown document as PDF */
export const md2pdf: Command = {
  name: 'md2pdf',
  arg: '<file.md>',
  output: '<out.pdf>',
  summary: 'Plain Markdown document -> PDF (8.5 x 11)',
  async run({ file: inputPath, name, out }) {
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
      // The page is printed from a temporary folder, so relative links and images (e.g.
      // images/foo.svg) are resolved from the document's own folder instead
      baseHref: pathToFileURL(path.dirname(inputPath) + path.sep).href,
    });

    // Save the page as a temporary file, print it, and delete it (even if
    // printing fails)
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lump-'));
    const htmlPath = path.join(tmpDir, `${name}.html`);
    fs.writeFileSync(htmlPath, html, 'utf8');
    try {
      return printToPdf(htmlPath, out);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
};

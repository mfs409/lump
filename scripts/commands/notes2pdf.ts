/**
 * `lump notes2pdf <deck.md>`: print a deck's presenter notes (not its slides;
 * see slides2pdf) to the PDF named by `-o`.
 *
 * The notes are the `<!-- ... -->` comments in each slide. They are gathered,
 * in slide order under each slide's title, into one HTML page, which is printed
 * with headless Chrome and then deleted.
 *
 * Notes are rendered by the same Markdown renderer as md2pdf (math, code,
 * mermaid diagrams, lists, tables), except that their text is kept exactly as
 * typed (see {@link notesHtml}).
 *
 * @module
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accentColor, deckSlides, splitFrontmatter } from '../lib/config.ts';
import { createMarkdown } from '../lib/markdown.ts';
import { renderPage } from '../lib/templates.ts';
import { printToPdf } from '../lib/chrome.ts';
import type { Command } from '../lib/command.ts';

/**
 * Gather a deck's presenter notes into one HTML page.
 *
 * Each slide's notes are rendered as Markdown, with three differences from
 * documents, so that notes print exactly as typed: single line breaks are kept,
 * raw HTML is shown as text, and there is no "smart" punctuation (which would
 * turn `0..n` into `0...n`) or backslash escaping (which would turn `\\` into
 * `\`). A note ends at the first `-->`, as HTML comments do.
 *
 * @param deckPath The deck's path.
 * @param deckName The deck's name, for the page heading.
 *
 * @returns The HTML page.
 */
async function notesHtml(deckPath: string, deckName: string) {
  // The deck's frontmatter holds its settings, such as the accent color
  const source = fs.readFileSync(deckPath, 'utf8');
  const { data, body } = splitFrontmatter(source, deckPath);
  const md = await createMarkdown(body, { breaks: true, html: false, typographer: false });
  md.disable('escape');

  // For each slide: its title, and its notes (each comment) rendered to HTML
  const slides = deckSlides(body).map((seg) => {
    const title = seg.match(/^#\s+(.+)$/m)![1].trim();
    const notes: string[] = [];
    for (const m of seg.matchAll(/<!--([\s\S]*?)-->/g)) {
      const body = m[1].trim();
      if (body) notes.push(md.render(body));
    }
    return { title, notes };
  });

  // Put them into the notes page template
  return renderPage('notes', accentColor(data, deckPath), {
    title: `${deckName} -- Presenter Notes`,
    deckName,
    slides,
  });
}

/** The `notes2pdf` command for printing a deck's presenter notes as PDF */
export const notes2pdf: Command = {
  name: 'notes2pdf',
  arg: '<deck.md>',
  output: '<out.pdf>',
  summary: "Deck's presenter notes -> PDF",
  async run({ file, name, out }) {
    // Save the page as a temporary file, print it, and delete it (even if
    // printing fails)
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lump-'));
    const htmlPath = path.join(tmpDir, `${name}.notes.html`);
    fs.writeFileSync(htmlPath, await notesHtml(file, name), 'utf8');
    try {
      return printToPdf(htmlPath, out);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  },
};

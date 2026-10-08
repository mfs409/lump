/**
 * Print HTML pages to PDF with headless system Chrome, for md2pdf and
 * notes2pdf.
 *
 * No Playwright/Puppeteer is needed for this, since Chrome's own
 * `--print-to-pdf` does the job directly. (slides2pdf is different; see the
 * comments in `scripts/commands/slides2pdf.ts`.)
 *
 * @module
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { findChrome } from './config.ts';

/**
 * Prints a local HTML file to a PDF, with no browser header or footer.
 *
 * Chrome is given a virtual-time budget, so that asynchronous rendering
 * (mermaid diagrams) finishes before the page prints, and is allowed to load
 * the page's scripts and stylesheets from `node_modules` via `file://` URLs.
 * Chrome's own output is shown in the terminal.
 *
 * @param htmlPath The HTML file to print.
 * @param outPath Where to write the PDF (an existing file is replaced).
 *
 * @returns Chrome's exit status (0 for success).
 *
 * @throws {LumpError} If no Chrome/Chromium can be found (see
 *         {@link findChrome}).
 */
export function printToPdf(htmlPath: string, outPath: string): number {
  const chromePath = findChrome();
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--print-to-pdf=${outPath}`,
    '--no-pdf-header-footer',
    '--virtual-time-budget=10000',
    '--allow-file-access-from-files',
    pathToFileURL(htmlPath).href,
  ];

  console.log(`Printing ${htmlPath} -> ${outPath} (using ${chromePath}) ...`);
  const res = spawnSync(chromePath, args, { stdio: 'inherit' });
  if (res.status === 0 && fs.existsSync(outPath)) {
    console.log(`Wrote ${outPath}`);
  }
  return res.status ?? 1;
}

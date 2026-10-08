/**
 * `lump slides2pdf <deck.md>`: export a deck's slides to `out/<deck>.pdf`, one
 * page per slide, shaped like the slides (16:9 unless the deck's frontmatter
 * sets `aspectRatio`).
 *
 * Each slide is printed separately, from its own URL on a slidev dev server,
 * and the pages are then merged into one PDF.
 * - Printing slides one at a time keeps the theme's page numbers correct
 * - Playwright's `page.pdf()` sets the exact page size (vs US Letter in Chrome)
 *
 * Requires `pdfunite` (from poppler-utils) for the merge.
 *
 * @module
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-chromium';
import { LumpError, OUT_DIR, ROOT, deckSlides, findChrome, splitFrontmatter } from '../lib/config.ts';
import type { Command } from '../lib/command.ts';

/**
 * The width of each page, in pixels: large, for crisp output.  The height will
 * be determined via the slide's aspect ratio.
 */
const PAGE_WIDTH = 1920;

/**
 * Compute the page size for a deck, from the `aspectRatio` setting in its
 * frontmatter (the block between `---` lines at the top of the deck), which
 * is also what makes slidev lay the slides out at that shape. Slidev accepts
 * a fraction (`aspectRatio: 4/3`, quoted or not) or a number
 * (`aspectRatio: 1.333`); without the setting, decks are 16:9.
 *
 * @param data     The deck's frontmatter settings (see `splitFrontmatter`).
 * @param deckPath The deck's path, for the error message.
 *
 * @returns The page size in pixels, {@link PAGE_WIDTH} wide; also used as the
 *          browser window size.
 *
 * @throws {LumpError} If `aspectRatio` is set to something that isn't a
 *         positive fraction or number.
 */
function pageSize(data: Record<string, unknown>, deckPath: string) {
  const setting = data.aspectRatio;
  let ratio = 16 / 9;
  if (setting !== undefined) {
    // YAML reads 1.333 as a number, and 4/3 as text
    const value = String(setting).trim();
    const fraction = value.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    ratio = fraction ? Number(fraction[1]) / Number(fraction[2]) : Number(value);
    if (!(ratio > 0 && Number.isFinite(ratio))) {
      throw new LumpError(
        `Could not understand "aspectRatio: ${setting}" in ${deckPath}.\nUse a fraction like 16/9 or 4/3, or a number like 1.333.`
      );
    }
  }
  return { width: PAGE_WIDTH, height: Math.round(PAGE_WIDTH / ratio) };
}

/**
 * Find a free port, by asking the operating system for one: a socket opened on
 * port 0 is given a free port, which is noted before the socket is closed.
 *
 * @returns A port number that is free on localhost.
 */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on('error', reject);
    probe.listen(0, 'localhost', () => {
      const { port } = probe.address() as net.AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Wait for a web server to start answering.
 *
 * @param url          The URL to request, once a second.
 * @param maxTries     How many requests to make before giving up.
 * @param stillRunning Reports whether the server is still running; waiting
 *                     stops early once it isn't.
 *
 * @returns True once the URL answers with status 200; false if it never does,
 *          or if the server stops first.
 */
async function waitForServer(url: string, maxTries: number, stillRunning: () => boolean): Promise<boolean> {
  for (let i = 0; i < maxTries && stillRunning(); i++) {
    try {
      if ((await fetch(url)).status === 200) return true;
    } catch {
      // not listening yet
    }
    await sleep(1000);
  }
  return false;
}

/** The `slides2pdf` command for exporting a deck as PDF */
export const slides2pdf: Command = {
  name: 'slides2pdf',
  arg: '<deck.md>',
  summary: 'Slidev deck -> out/<deck>.pdf (one page per slide)',
  async run({ file: deckPath, name: deckName }) {
    // Step 1: check for the programs we need: Chrome and pdfunite
    const chromePath = findChrome();
    if (!spawnSync('which', ['pdfunite']).stdout?.toString().trim()) {
      throw new LumpError('pdfunite (from poppler-utils) is required to merge the per-slide PDFs, but was not found on PATH.');
    }

    // Step 2: read the deck, to learn how many pages to print and their size
    const { data, body } = splitFrontmatter(fs.readFileSync(deckPath, 'utf8'), deckPath);
    const slideCount = deckSlides(body).length;
    if (!slideCount) {
      throw new LumpError(`Could not find any slides in ${deckPath}.`);
    }
    const size = pageSize(data, deckPath);

    // Step 3: make the output folder, and a temporary folder for the
    // per-slide PDFs (deleted afterward)
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const outPath = path.join(OUT_DIR, `${deckName}.pdf`);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'slides2pdf-'));

    // Step 4: start a dev server on a free port (so two exports can run at
    // once). The slidev binary is run directly, not through npx, because
    // killing npx would not stop the server it starts. Its output is kept, to
    // show if it fails to start, and we note when it exits.
    const port = await freePort();
    console.log(`Starting dev server for ${deckName} on port ${port} ...`);
    const slidevBin = path.join(ROOT, 'node_modules', '.bin', 'slidev');
    const server = spawn(slidevBin, [deckPath, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let serverOutput = '';
    server.stdout.on('data', (chunk) => (serverOutput += chunk));
    server.stderr.on('data', (chunk) => (serverOutput += chunk));
    let serverRunning = true;
    server.on('exit', () => (serverRunning = false));

    // From here on, the server and the temporary folder must be cleaned up
    // however the export ends: normally or with an error (the `finally`
    // below), or by Ctrl-C
    const cleanup = () => {
      server.kill();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    };
    const onInterrupt = () => {
      cleanup();
      process.exit(130);
    };
    process.on('SIGINT', onInterrupt);

    try {
      // Step 5: wait (up to 30 seconds) for the server to show the first
      // slide. If the server stopped instead, show why.
      if (!(await waitForServer(`http://localhost:${port}/1`, 30, () => serverRunning))) {
        throw new LumpError(
          serverRunning
            ? 'Dev server did not come up in time.'
            : `The slidev dev server stopped before it was ready. Its output was:\n${serverOutput.trim()}`
        );
      }

      // Step 6: print each slide's page (/1, /2, ...) to its own one-page PDF,
      // in a browser window the size of the page
      const browser = await chromium.launch({ executablePath: chromePath });
      const page = await browser.newPage({ viewport: size });
      console.log(`Exporting ${slideCount} slides ...`);
      const slidePdfs: string[] = [];
      for (let n = 1; n <= slideCount; n++) {
        // Open the slide, and wait until it has stopped loading files
        await page.goto(`http://localhost:${port}/${n}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(300); // let diagrams and late-loading content finish drawing
        // Zero-padded names (slide_0001.pdf) keep the files in slide order
        const slidePdf = path.join(tmpDir, `slide_${String(n).padStart(4, '0')}.pdf`);
        await page.pdf({
          path: slidePdf,
          width: `${size.width}px`,
          height: `${size.height}px`,
          printBackground: true,
        });
        slidePdfs.push(slidePdf);
        // Progress: \r returns to the start of the line, so each count
        // overwrites the previous one
        process.stdout.write(`  ${n}/${slideCount}\r`);
      }
      console.log(`  ${slideCount}/${slideCount} done`);
      await browser.close();

      // Step 7: merge the pages with pdfunite (GhostScript messes up font
      // glyphs)
      console.log(`Merging into ${outPath} ...`);
      const mergeRes = spawnSync('pdfunite', [...slidePdfs, outPath]);
      if (mergeRes.status !== 0) {
        throw new LumpError('pdfunite merge failed: ' + mergeRes.stderr?.toString());
      }
      console.log(`Wrote ${outPath}`);
      return 0;
    } finally {
      // Stop the server and delete the temporary folder, and remove the
      // Ctrl-C handler, which is no longer needed
      process.off('SIGINT', onInterrupt);
      cleanup();
    }
  },
};

/**
 * `lump slides2pdf <deck.md> -o <out.pdf>`: export a deck's slides to a PDF, one
 * page per slide, shaped like the slides (16:9 unless the deck's frontmatter
 * sets `aspectRatio`).
 *
 * The whole deck is printed in one go, from slidev's `/export?print` page on a
 * dev server, which lays out every slide as one printable page.
 * - The theme's page numbers are correct here because `slidev/global-top.vue` (lump's addon)
 *   numbers each slide itself (the theme's own number shows "1" on every page)
 * - Playwright's `page.pdf()` sets the exact page size (vs US Letter in Chrome)
 *
 * @module
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright-chromium';
import { LumpError, deckSlides, findChrome, splitFrontmatter } from '../lib/config.ts';
import { SLIDEV_BIN, themeArgs } from '../lib/slidev.ts';
import type { Command } from '../lib/command.ts';

/**
 * How long to let the printable page settle before printing it, in
 * milliseconds, so that diagrams and late-loading content finish drawing.
 */
const SETTLE_MS = 1000;

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
  output: '<out.pdf>',
  summary: 'Slidev deck -> PDF (one page per slide)',
  async run({ file: deckPath, name: deckName, out: outPath }) {
    // Step 1: find Chrome
    const chromePath = findChrome();

    // Step 2: read the deck, to check that it has slides (and to report how
    // many there are)
    const { body } = splitFrontmatter(fs.readFileSync(deckPath, 'utf8'), deckPath);
    const slideCount = deckSlides(body).length;
    if (!slideCount) {
      throw new LumpError(`Could not find any slides in ${deckPath}.`);
    }

    // Step 3: make the output file's folder
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    // Step 4: start a dev server on a free port (so two exports can run at
    // once). The slidev binary is run directly, not through npx, because
    // killing npx would not stop the server it starts. Its output is kept, to
    // show if it fails to start, and we note when it exits.
    const theme = themeArgs(deckPath); // (first, so a missing theme is reported before anything starts)
    const port = await freePort();
    console.log(`Starting dev server for ${deckName} on port ${port} ...`);
    const server = spawn(SLIDEV_BIN, [deckPath, '--port', String(port), ...theme], { stdio: ['ignore', 'pipe', 'pipe'] });
    let serverOutput = '';
    server.stdout.on('data', (chunk) => (serverOutput += chunk));
    server.stderr.on('data', (chunk) => (serverOutput += chunk));
    let serverRunning = true;
    server.on('exit', () => (serverRunning = false));

    // From here on, the server must be stopped however the export ends:
    // normally or with an error (the `finally` below), or by Ctrl-C
    const cleanup = () => server.kill();
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

      // Step 6: open the printable page, which has every slide in it, and
      // give it time to finish loading and drawing
      const browser = await chromium.launch({ executablePath: chromePath });
      try {
        const page = await browser.newPage();
        console.log(`Exporting ${slideCount} slides ...`);
        await page.goto(`http://localhost:${port}/export?print`, { waitUntil: 'networkidle' });
        // On a deck's first run, the dev server may find new dependencies and reload the page, so wait for the
        // slides to be there (not just for the network to go quiet), and then for the page to settle
        await page.waitForSelector('.print-slide-container', { timeout: 30000 }).catch(() => {});
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(SETTLE_MS);
        // Animations (`<Manim>`) draw their last frame once they have started, and videos (`<Vid>`) show their
        // frame once they have moved to it: wait for both, on every slide, as long as it takes
        await page
          .waitForFunction(
            () =>
              [...document.querySelectorAll<HTMLElement>('.manim')].every((e) => e.dataset.ready) &&
              [...document.querySelectorAll('video')].every((v) => v.readyState >= 2 && !v.seeking),
            null,
            { timeout: 60000 }
          )
          .catch(() => console.log('Some animations or videos were not ready after 60 seconds; printing anyway.'));
        await page.waitForTimeout(300); // (to draw what they showed last)

        // Step 7: print it, one page per slide. Slidev lays each slide out on
        // a fixed-size canvas (980 px wide for 16:9, or as set by
        // `aspectRatio`), so the page is made exactly that size.
        const canvas = await page.evaluate(() => {
          const slide = document.querySelector('.print-slide-container') as HTMLElement | null;
          return slide && { width: slide.offsetWidth, height: slide.offsetHeight };
        });
        if (!canvas) {
          throw new LumpError('Slidev\'s printable page did not show any slides.');
        }
        await page.pdf({
          path: outPath,
          width: `${canvas.width}px`,
          height: `${canvas.height}px`,
          printBackground: true,
        });
      } finally {
        await browser.close();
      }
      console.log(`Wrote ${outPath}`);
      return 0;
    } finally {
      // Stop the server, and remove the Ctrl-C handler, which is no longer
      // needed
      process.off('SIGINT', onInterrupt);
      cleanup();
    }
  },
};

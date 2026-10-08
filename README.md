# Markdown-to-PDF workflow: Slidev slide decks, presenter-notes handouts, and plain Markdown documents

Lump is a command-line tool for making PDF files from markdown.
It is built on top of [slidev](https://sli.dev/), and solves a few important workflow issues I encountered with slidev:

1. Slidev's export-to-pdf feature can make mistakes with slide numbering
2. Slidev's notes-export feature doesn't handle markdown extensions as nicely as the rest of slidev
3. Slidev's focus is slides, so non-slide markdown (like syllabi) needs a separate md-to-pdf tool

Lump solves these via a few simple command-line scripts that call out to the slidev ecosystem.

## Usage

Everything is done through one command-line tool, `lump`:

| Command                                 | Input                    | Output                                                  |
|-----------------------------------------|--------------------------|---------------------------------------------------------|
| `npm run lump md2pdf <file.md>`         | Any plain Markdown file  | PDF: `out/<file>.pdf` (8.5 x 11)                        |
| `npm run lump slides2pdf <deck.md>`     | Slidev deck in `slides/` | PDF: `out/<deck>.pdf` (one page per slide)              |
| `npm run lump notes2pdf <deck.md>`      | Slidev deck in `slides/` | PDF: `out/<deck>.notes.pdf` (printable presenter notes) |
| `npm run lump slides2website <deck.md>` | Slidev deck in `slides/` | WEB: `out/<deck>/` as a static website                  |
| `npm run lump start <deck.md>`          | Slidev deck in `slides/` | N/A: serves a deck in support of live editing           |
| `npm run lump help`                     |                          | Lists the commands                                      |

Every command takes one argument: the path to a Markdown file (e.g. `npm run lump slides2pdf slides/01_example.md`).
Decks must live in `slides/` so Slidev finds `style.css` and `public/` next to them.

Documents (`md2pdf`) and presenter notes (`notes2pdf`) support the same Markdown extras as slides: tables, `$math$` and `$$math$$`, mermaid diagrams, and syntax-highlighted code blocks.
Images in a document are found relative to the document's own folder (e.g. `![diagram](images/diagram.svg)`).
A document may start with a settings block (see Customizing); it is not printed.

## Setup

Requirements: Node 20.11+, Google Chrome or Chromium, and `pdfunite` (poppler-utils: `apt install poppler-utils` / `brew install poppler`) for `slides2pdf`.

```sh
npm install
npm run lump slides2pdf slides/01_example.md     # try the bundled example deck
```

If Chrome is not in a standard location, set `CHROME_PATH=/path/to/chrome`.

## Layout

```text
docs/              plain Markdown documents for md2pdf (images/ alongside)
slides/            decks (NN_name.md), style.css, public/images/
scripts/           lump.ts (the command-line tool), commands/ (one file per command), lib/ (shared code)
templates/         LiquidJS page templates for md2pdf and notes output
out/               all generated output, git-ignored
```

The scripts are TypeScript, run directly by `tsx` (there is no build step).
`npm run typecheck` checks them with `tsc`.
To add a command, create a file in `scripts/commands/` that exports a `Command` (see `scripts/lib/command.ts`) and add it to the list in `scripts/lump.ts`.

Deck conventions:

- Slides are separated by lone `---` lines, and every slide has a `# Title`.
  (Segments without a single-`#` heading are treated as per-slide front matter, not slides.)
- Presenter notes are HTML comments inside a slide.
  They are rendered as Markdown, like documents ($math$, fenced code, mermaid diagrams, tables), except that text is kept exactly as typed:
  no backslash escapes and no "smart" punctuation.
- A note ends at the first `-->`, so mermaid diagrams in notes must not use `-->` arrows; use `-.->` or `==>` instead.
- Slides are 16:9 unless the deck's front matter (the settings block at the top) sets another shape, e.g. `aspectRatio: 4/3`.
  `slides2pdf` makes its pages this same shape.

## Customizing

- **Accent color** (primarily for slide titles and page numbers):
  The default for everything is the `--slidev-theme-primary` line in `slides/style.css`.
  A single document or deck can use its own color by setting it in its front matter (the settings block between `---` lines at the top of the file).
  If you do this, be sure to put the HTML color code in single quotes:

  ```yaml
  ---
  themeConfig:
    primary: '#502d0e'
  ---
  ```

- **Slide shape**: set `aspectRatio` in a deck's front matter (see Deck conventions).
- **Slide styles**: `slides/style.css` applies to every deck in `slides/`.
  Some of its rules (e.g. the page-number color) are written for the `academic` theme.
- **Slide theme**: decks use `slidev-theme-academic`, which is installed with this project.
  To use another Slidev theme, install it here (`npm install slidev-theme-<name>`) and set `theme: <name>` in the deck's front matter.
- **Code colors** in documents and notes: the Shiki theme named by `CODE_THEME` in `scripts/lib/markdown.ts` (default `github-light`; any [Shiki theme](https://shiki.style/themes) works).
- **Page layout** of documents and notes (fonts, spacing, headings): the LiquidJS templates in `templates/`.

# Markdown-to-PDF workflow: Slidev slide decks, presenter-notes handouts, and plain Markdown documents

Lump is a command-line tool for making PDF files from markdown.
It is built on top of [slidev](https://sli.dev/), and solves a few important workflow issues I encountered with slidev:

1. Slidev's export-to-pdf feature can make mistakes with slide numbering
2. Slidev's notes-export feature doesn't handle markdown extensions as nicely as the rest of slidev
3. Slidev's focus is slides, so non-slide markdown (like syllabi) needs a separate md-to-pdf tool

Lump solves these via a few simple command-line scripts that call out to the slidev ecosystem.

Lump also has a video component that can be useful if you're planning to deliver slides from a browser.
The syntax is `<Vid><video src="/videos/x.mp4"></video></Vid>`.
The `Vid` component gives space, arrow, and shift-arrow for navigation.
Note that clicking a video moves key capture to it.
Pressing escape returns key capture to the slides.

Since you're likely to make your videos with `manim`, lump also has `manim-web` support, so you can render on the fly instead of bundling `mp4` files.

## Usage

Everything is done through one command-line tool, `lump`:

| Command                                         | Input                   | Output                                                  |
|-------------------------------------------------|-------------------------|---------------------------------------------------------|
| `lump md2pdf <file.md> -o <out.pdf>`            | Any plain Markdown file | PDF (8.5 x 11)                                          |
| `lump slides2pdf <deck.md> -o <out.pdf>`        | Slidev deck             | PDF (one page per slide)                                |
| `lump notes2pdf <deck.md> -o <out.pdf>`         | Slidev deck             | PDF (printable presenter notes)                         |
| `lump slides2website <deck.md> -o <out-folder>` | Slidev deck             | WEB: a static website, in a folder (put it anywhere)    |
| `lump start <deck.md>`                          | Slidev deck             | N/A: serves a deck in support of live editing           |
| `lump help`                                     |                         | Lists the commands                                      |

Every command takes one argument: the path to a Markdown file (e.g. `lump slides2pdf talk.md -o talk.slides.pdf`).
Every command that writes something requires `-o` (or `--output`), which says where: a PDF file, or for `slides2website` a folder.
A relative path is from the folder you run `lump` from, and missing folders on the way are created.
lump refuses to write over the Markdown file itself, and `slides2website` only builds into a folder that is new, empty, or a website built before (the build replaces what is in it).

The website is relocatable: its paths are all relative, and its slides are addressed after a `#` (`.../talk/#/3`), so no server settings are needed.
Serve the folder itself (its `index.html` is the site), or copy it anywhere, under any name and at any depth, in a folder that a web server serves (link to it with a trailing slash, `.../talk/`: that is safest, since not every server redirects `.../talk` to `.../talk/`).
The page loads its fonts from Google Fonts, so a viewer needs to be online for them.
A deck can be in any folder: slidev looks for the deck's `public/` (images, videos), `style.css` (extra styles), and `manim/` (see Manim animations) next to it.
(In this repository's own folder, `npm run lump -- <command> <file> -o <output>` does the same.)

Under `lump start`, the slidev navigation bar has two extra buttons: one inserts a copy of the current slide (without ink) after it, and one inserts a blank slide after it.
Both edit the deck's `.md` file, and shift the ink of later slides to match.

Documents (`md2pdf`) and presenter notes (`notes2pdf`) support the same Markdown extras as slides: tables, `$math$` and `$$math$$`, mermaid diagrams, and syntax-highlighted code blocks.
Images in a document are found relative to the document's own folder (e.g. `![diagram](images/diagram.svg)`).
A document may start with a settings block (see Customizing); it is not printed.

## Examples

- `examples/doc/example.md`: a plain document (`lump md2pdf examples/doc/example.md -o example.pdf`), with a table, code, a diagram, an image, and math.
- `examples/slides/example.md`: a deck that shows what lump's slides support: a cover, a Python Manim animation as a small rendered video (slide 2), the same animation live as manim-web (slide 3), syntax-highlighted code, KaTeX math, a Mermaid diagram, a table, SVG images, a two-column layout, and presenter notes (which `lump notes2pdf` collects).
  Try `lump start examples/slides/example.md`, or `lump slides2pdf examples/slides/example.md -o slides.pdf`.
  Python is not needed to use the deck: it is only for re-rendering its video, from `examples/slides/manim/square_to_circle.py`, which also needs LaTeX (for its `MathTex` equation); that script's header has the setup.
  The live manim-web version of the same animation needs neither.

## Setup

Requirements: Node 20.11+, and Google Chrome or Chromium.

```sh
git clone <this repository> && cd lump
npm install
npm link                                  # puts the `lump` command on your PATH
lump slides2pdf examples/slides/example.md -o example.pdf   # try the bundled example deck
```

After that, `lump` works from any folder: a deck's folder needs no `package.json`, no `node_modules`, and no copy of lump.
lump supplies slidev, the `academic` theme, and its own addon (page numbers, the Manim player, the slide-insert buttons, default styles) to every deck.

If Chrome is not in a standard location, set `CHROME_PATH=/path/to/chrome`.

The first `lump start` (or export) of a deck in a new folder is slower and may reload the page once or twice, while Vite finds the dependencies to prepare in that folder's cache; later runs are fast.

## Layout

```text
bin/lump.js        the `lump` command (loads scripts/lump.ts through tsx)
scripts/           lump.ts (the command-line tool), commands/ (one file per command), lib/ (shared code)
slidev/            lump's slidev addon, added to every deck: components/, setup/, style.css (default styles and accent
                   color), vite.config.ts, and manim/ (the generic Manim player; see Manim animations)
templates/         LiquidJS page templates for md2pdf and notes output
examples/doc/      an example plain Markdown document for md2pdf (images/ alongside)
examples/slides/   an example deck, example.md, with its public/ (images, a small video) and manim/ (one animation, as
                   Python Manim and as manim-web)
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
  The default for everything is the `--slidev-theme-primary` line in lump's `slidev/style.css`.
  A single document or deck can use its own color by setting it in its front matter (the settings block between `---` lines at the top of the file).
  If you do this, be sure to put the HTML color code in single quotes:

  ```yaml
  ---
  themeConfig:
    primary: '#502d0e'
  ---
  ```

- **Slide shape**: set `aspectRatio` in a deck's front matter (see Deck conventions).
- **Slide styles**: lump's `slidev/style.css` applies to every deck.
  Some of its rules (e.g. the page-number color) are written for the `academic` theme.
  A `style.css` next to a deck is added after it, so it can override any rule for the decks in that folder.
- **Slide theme**: decks use `slidev-theme-academic`, which comes with lump.
  To use another Slidev theme, set `theme: <name>` in the deck's front matter, and install the theme either next to the deck (`npm install slidev-theme-<name>` in the deck's folder, which then needs a `package.json`: `npm init -y`) or in lump's own folder.
  lump looks next to the deck first.
  Don't set `addons:` in a deck's front matter: lump adds its own addon that way, and a deck's setting would replace it (lump says so if you do).

## Manim animations

`<Manim src="tour" />` in a deck shows the animation in `manim/tour.ts`, next to the deck (a [manim-web](https://www.npmjs.com/package/manim-web) scene; `examples/slides/` has one animation as a rendered video (slide 2) and as a live scene (slide 3), and `ANIMATIONS.md` explains how Python Manim scenes are ported).
A scene's file exports `async (t) => { ... }`, which calls `t.play(seconds, ...animations)` and `t.wait(seconds)`.
It imports lump's helpers from `lump-manim/mn` (colors, shapes, text), `lump-manim/code`, and anything else lump itself depends on (such as `manim-web`) by name.

The player has two modes, switched by the ☰ button (and remembered):

- **Steps** (the default): the presenter moves through the animation a step at a time (right arrow, space, or a click; left arrow goes back).
  A step is a short transition, or, with the ⚡ button (key `S`), an instant jump.
  Steps are found automatically (each `t.wait` of half a second or more is a break), and `t.step()` marks one by hand.
  On the last step, the arrow keys go on to the next slide.
- **Video**: it plays like a video, with a scrub bar, and pause, frame-step, and jump keys.

- **Code colors** in documents and notes: the Shiki theme named by `CODE_THEME` in `scripts/lib/markdown.ts` (default `github-light`; any [Shiki theme](https://shiki.style/themes) works).
- **Page layout** of documents and notes (fonts, spacing, headings): the LiquidJS templates in `templates/`.

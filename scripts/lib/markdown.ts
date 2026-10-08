/**
 * Render Markdown to HTML for md2pdf and notes2pdf, so plain documents and
 * presenter notes look the same:
 *
 * - markdown-it, with GFM tables
 * - math: `$...$` inline and `$$...$$` display, rendered to HTML by KaTeX
 * - ` ```mermaid ` code blocks, rendered by mermaid
 * - other code blocks, syntax-highlighted by Shiki (as on the slides), with
 *   the light {@link CODE_THEME} theme
 *
 * KaTeX, mermaid and Shiki are loaded from `node_modules`, so no internet is
 * needed.
 *
 * @module
 */
import MarkdownIt, { type Options, type StateBlock, type StateInline } from 'markdown-it';
import katex from 'katex';
import { bundledLanguages, createHighlighter, type BundledLanguage } from 'shiki';
import { fromHighlighter } from '@shikijs/markdown-it/core';

/**
 * `file://` URL of the KaTeX stylesheet, which styles the math HTML that
 * {@link renderTex} produces.
 */
export const KATEX_CSS = import.meta.resolve('katex/dist/katex.min.css');

/**
 * `file://` URL of the mermaid script, which draws the diagrams in every
 * `<pre class="mermaid">` block.
 */
export const MERMAID_JS = import.meta.resolve('mermaid/dist/mermaid.min.js');

/** The Shiki color theme for code blocks: a light one, which prints well. */
const CODE_THEME = 'github-light';

/**
 * Find the languages that a Markdown text's code blocks use, among those Shiki
 * knows, so that only those need to be loaded (Shiki has about 200).
 *
 * @param source The Markdown text.
 *
 * @returns The language names, e.g. `["python", "scheme"]`.
 */
function codeLanguages(source: string): string[] {
  const names = [...source.matchAll(/^[ \t]*(?:```|~~~)[ \t]*([^\s`{]+)/gm)].map((m) => m[1].toLowerCase());
  return [...new Set(names)].filter((name) => name in bundledLanguages);
}

/**
 * Render TeX to HTML with KaTeX.
 *
 * A TeX error is shown in red on the page instead of stopping the whole
 * document.
 *
 * @param tex         The TeX source, without the surrounding `$` or `$$`.
 * @param displayMode True for display math (centered, on its own line), false
 *                    for inline math.
 *
 * @returns The rendered HTML.
 */
function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

/**
 * A markdown-it plugin for math.
 *
 * - `$$...$$` is display math. The `$$` lines may be on their own lines, or
 *   around a one-line formula (`$$x^2$$`).
 * - `$...$` is inline math. To keep dollar amounts ("$5 and $10") as text, the
 *   opening `$` must not be followed by a space, and the closing `$` must not
 *   be preceded by a space or followed by a digit.
 *
 * @param md The markdown-it instance to extend.
 */
function mathPlugin(md: MarkdownIt): void {
  // Markdown-it first *parses* the Markdown into a list of tokens, by trying a
  // list of "rules" at each position.  Then it *renders* each token to HTML
  // with a render rule named after the token's type.
  //
  // This plugin adds two parse rules (display math, inline math) that produce
  // `math_block` and `math_inline` tokens, and two render rules that turn those
  // tokens into KaTeX HTML.
  //
  // Every parse rule follows the same conventions:
  //   - Return false to mean "not math here"; markdown-it then tries its other
  //     rules at this position.
  //   - Return true after consuming the math (advancing the parser past it).
  //   - When `silent` is true, markdown-it is only asking "would you match
  //     here?" (to decide where other constructs end), so answer without
  //     creating a token.

  // Parse rule 1: display math ($$...$$), a block of one or more lines. It
  // runs before the code-fence rule, so a $$ line is seen as math first.
  md.block.ruler.before('fence', 'math_block', (state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean => {
    // The text of line n, without its indentation
    const lineText = (n: number) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);

    // Step 1: the block must start with $$
    const first = lineText(startLine);
    if (!first.startsWith('$$')) return false;

    // Step 2: collect the TeX between the opening and closing $$
    let body = first.slice(2);
    let line = startLine;
    if (body.trimEnd().endsWith('$$') && body.trim().length > 2) {
      // One-line formula: $$x^2$$
      body = body.trimEnd().slice(0, -2);
    } else {
      // Multi-line formula: keep reading lines until one ends with $$
      const parts = [body];
      for (line = startLine + 1; line < endLine; line++) {
        const text = lineText(line);
        if (text.trimEnd().endsWith('$$')) {
          parts.push(text.trimEnd().slice(0, -2));
          break;
        }
        parts.push(text);
      }
      if (line >= endLine) return false; // no closing $$
      body = parts.join('\n');
    }
    if (silent) return true;

    // Step 3: emit a math_block token holding the TeX, and move the parser
    // to the line after the closing $$
    const token = state.push('math_block', 'div', 0);
    token.content = body.trim();
    token.map = [startLine, line + 1];
    state.line = line + 1;
    return true;
  }
  );

  // Parse rule 2: inline math ($...$) within a line of text. It runs right
  // after the backslash-escape rule, so \$ stays a literal dollar sign.
  md.inline.ruler.after('escape', 'math_inline', (state: StateInline, silent: boolean): boolean => {
    const src = state.src;
    const start = state.pos;

    // Step 1: there must be a single $ here ($$ is display math, not ours)
    if (src[start] !== '$' || src[start + 1] === '$') return false;

    // Step 2: find the closing $, applying the dollar-amount rules: the
    // opening $ must not be followed by a space; the closing $ must not be
    // preceded by one or followed by a digit (so "$5 and $10" stays text).
    // An escaped \$ inside the math is skipped over.
    if (/\s/.test(src[start + 1] || ' ')) return false;
    let end = start + 1;
    while ((end = src.indexOf('$', end)) !== -1) {
      if (src[end - 1] === '\\') {
        end++;
        continue;
      }
      if (/\s/.test(src[end - 1]) || /\d/.test(src[end + 1] || '')) return false;
      break;
    }
    if (end === -1 || end === start + 1) return false; // no closing $, or "$$"

    // Step 3: emit a math_inline token holding the TeX, and move the parser
    // past the closing $
    if (!silent) {
      const token = state.push('math_inline', 'span', 0);
      token.content = src.slice(start + 1, end);
    }
    state.pos = end + 1;
    return true;
  });

  // Render rules: turn the two token types into KaTeX HTML. Display math is
  // wrapped in a div, so it can be styled (see .math-display in the templates).
  md.renderer.rules.math_block = (tokens, idx) => `<div class="math-display">${renderTex(tokens[idx].content, true)}</div>\n`;
  md.renderer.rules.math_inline = (tokens, idx) => renderTex(tokens[idx].content, false);
}

/**
 * Create a Markdown renderer with math, mermaid and code highlighting.
 *
 * The defaults allow raw HTML, turn bare URLs into links, and use "smart"
 * punctuation (curly quotes, dashes).
 *
 * @param source  The Markdown text that will be rendered, used only to find
 *                which code languages to load for highlighting. Code in any
 *                other language is shown without highlighting.
 * @param options markdown-it options that override the defaults (e.g.
 *                `{ breaks: true }` to keep single line breaks, as presenter
 *                notes do).
 *
 * @returns The renderer; call its `render()` method on Markdown text.
 */
export async function createMarkdown(source: string, options: Options = {}): Promise<MarkdownIt> {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true, ...options }).use(mathPlugin);

  // Code blocks are highlighted by Shiki. Blocks with no language, or one
  // that wasn't loaded, are shown as plain text.
  const highlighter = await createHighlighter({ themes: [CODE_THEME], langs: codeLanguages(source) });
  // ('text' is Shiki's plain-text language; the plugin's types leave it out,
  // although the plugin itself uses it as the default.)
  const plainText = 'text' as BundledLanguage;
  md.use(fromHighlighter(highlighter, { theme: CODE_THEME, fallbackLanguage: plainText }));

  // ```mermaid fences become <pre class="mermaid"> (not highlighted code)
  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    if (token.info.trim() === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre>\n`;
    }
    return defaultFence(tokens, idx, opts, env, self);
  };

  return md;
}

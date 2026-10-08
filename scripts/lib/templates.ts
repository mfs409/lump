/**
 * Render the LiquidJS page templates in `templates/` (at the project root)
 * into complete HTML pages.
 *
 * @module
 */
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { ROOT } from './config.ts';
import { KATEX_CSS, MERMAID_JS } from './markdown.ts';

/**
 * The LiquidJS engine. Templates are named without their `.liquid` extension,
 * and every `{{ value }}` is HTML-escaped unless the template passes it through
 * `| raw` (which it does only for HTML we rendered ourselves, such as the
 * rendered Markdown).
 */
const engine = new Liquid({
  root: path.join(ROOT, 'templates'),
  extname: '.liquid',
  outputEscape: 'escape',
});

/**
 * Render a page template to HTML.
 *
 * Besides the caller's `context`, every template gets `ACCENT` (the `accent`
 * color), `KATEX_CSS` and `MERMAID_JS` (`file://` URLs of the KaTeX stylesheet
 * and mermaid script in `node_modules`).
 *
 * @param template The template's name in `templates/`, without `.liquid` (e.g.
 *                 `"document"`).
 * @param accent   The accent color (see `accentColor` in `config.ts`).
 * @param context  The template's variables, as listed in the comment at the top
 *                 of each template.
 *
 * @returns The complete HTML page.
 */
export function renderPage(template: string, accent: string, context: Record<string, unknown>): string {
  return engine.renderFileSync(template, { ACCENT: accent, KATEX_CSS, MERMAID_JS, ...context });
}

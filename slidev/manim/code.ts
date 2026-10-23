/**
 * Laying out monospace code: one Text per line with its indentation kept, and a box around a token in a line.
 * (A Text is a canvas texture, not vector glyphs, so a token's position is worked out from the monospace width.)
 */
import { Mobject, Text } from 'manim-web';
import { LEFT, MONO, rect, txt, pt } from './mn';

/** Width of one character of the monospace font at `fs` (a canvas measurement, so it matches what Text draws) */
export function monoAdvance(fs: number): number {
  const ctx = document.createElement('canvas').getContext('2d')!;
  ctx.font = `${fs}px ${MONO}`;
  // Text's world size = pixels * (fontSize/48-ish scale); measure a Text instead, for consistency
  const a = txt('0'.repeat(11), { size: fs, mono: true }).getWidth();
  const b = txt('0', { size: fs, mono: true }).getWidth();
  return (a - b) / 10;
}

/** Monospace code, one Text per line, with indentation kept (Text trims leading blanks) */
export function codeLines(lines: string[], fs: number, leftX: number, topY: number, step: number): Text[] {
  const adv = monoAdvance(fs);
  return lines.map((l, i) => {
    const ind = l.length - l.trimStart().length;
    const t = txt(l.trim(), { size: fs, mono: true });
    t.moveTo(pt(leftX + ind * adv, topY - i * step), LEFT);
    return t;
  });
}

/**
 * A box around variable `v` in a code line (Python indexed the line's glyphs; a Text here is a texture, so
 * this finds the variable's column in the line and measures with the monospace advance).
 * `line` is the Text made by {@link codeLines}; `str` is its text (the Text's own leading blanks are trimmed).
 */
export function tokenBox(line: Text, str: string, v: string, fs = 22, color = '#FFFF00', buff = 0.05): Mobject {
  const col = str.trim().search(new RegExp(`\\b${v}\\b`));
  if (col < 0) throw new Error(`no ${v} in ${str}`);
  const adv = monoAdvance(fs);
  const b = line.getBounds();
  const x = b.min.x + (col + 0.5) * adv;
  const cy = (b.min.y + b.max.y) / 2;
  return rect({ w: adv + 2 * buff, h: 0.2 + 2 * buff, stroke: color, sw: 3 }).moveTo(pt(x, cy));
}

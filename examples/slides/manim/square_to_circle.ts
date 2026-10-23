/**
 * The animation of slide 3 of example.md.  It's a TypeScript transliteration
 * of the python code from slide 2.
 *
 * You almost certainly don't want to write this by hand.  Agentic tools are
 * better at writing Python manim than they are at writing TypeScript
 * manim-web.  Your best bet is probably to use a tool to generate Python,
 * then use that tool to convert the Python to TypeScript.
 */
import { Circle, Create, FadeIn, FadeOut, MathTex, Square, Transform, Write } from 'manim-web';
import { BLUE_C, pt, txt, type Timed } from 'lump-manim/mn';

const PINK = '#D147BD';

export default async function (t: Timed) {
  const square = new Square({ sideLength: 2, color: BLUE_C });
  square.setFill(BLUE_C, 0.5);
  const circle = new Circle({ radius: 1.5, color: PINK });
  circle.setFill(PINK, 0.5);
  const title = txt('Square to circle', { size: 36 }).moveTo(pt(0, 3.4));
  // (raised from the bottom edge, to match the Python version, where the
  // video player's controls would cover it)
  const areaSquare = new MathTex({ latex: 'A = s^2' }).moveTo(pt(0, -2.6));
  const areaCircle = new MathTex({ latex: 'A = \\pi r^2' }).moveTo(pt(0, -2.6));

  await t.play(1, new Create(square));
  await t.play(1, new FadeIn(title), new Write(areaSquare));
  // (a wait of half a second or more is a step in the player's step mode)
  await t.wait(0.5);

  // (The Python version Transforms one equation into the other. In manim-web
  // that morph bends the `=` out of shape, so the equations are crossfaded;
  // the square still morphs into the circle.)
  await t.play(1.5, new Transform(square, circle), new FadeOut(areaSquare), new FadeIn(areaCircle));
  await t.wait(0.5);
}

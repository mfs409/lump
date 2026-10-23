# Porting a Python Manim scene to manim-web

You might not want to host lots of large video files.
Lump has a `<Manim src="name" />` block that lets you embed `manim-web` instead.
`manim-web` is pure JavaScript, so it tends to be a lot smaller and more self-contained.
However, it's a bit less mature and there isn't as much training data for it.
Your best bet is to make your animations with `manim` (Python), then use an agent to convert them to `manim-web`.

## Guidelines for Agents

Below are some quick notes from one not-too-inconsequential conversion.
They will hopefully be useful to agents.

### Getting Started

`examples/slides/manim/square_to_circle.ts` is a minimal scene: read it and `slidev/manim/mn.ts` first.

### Shape of a scene

```ts
import { FadeIn, Create } from 'manim-web';
import { type Timed, txt, rect, pt, GREY_B, Indicate } from 'lump-manim/mn';

export default async function (t: Timed) {          // t is Python's `self`
  t.sp = 1;                                         // Python's self.sp multiplier
  // build mobjects: all state is in local variables, because seeking re-runs the script from the top
  t.add(a, b);                                      // self.add
  await t.play(0.7, new FadeIn(a), new Create(b));  // self.play(FadeIn(a), Create(b), run_time=0.7)
  await t.wait(0.5);                                // self.wait(0.5)
  t.remove(a);                                      // self.remove
}
```

- Await every `play` and `wait`. `t.play(seconds, ...animations)` (Python's default `run_time` is 1). Never call manim-web's `scene.play` / `scene.wait`.
- The script must be deterministic (no `Math.random`, no `Date`) and keep no state outside the function.
- Python scene classes with helper methods (`self.read(...)`) become local `async function`s or a small class holding `t`; shared mutable state (`self.rn`) becomes local variables.
- `t.legacyWait = true` for scenes whose Python class is a `Timed`: its `wait(d)` really lasts `sp` seconds, and the rendered videos have that timing. 
  Plain `Scene` classes keep real waits.

## Steps

The viewer's step mode moves through a scene a step at a time.
Steps are found automatically: the moment before each `t.wait()` of 0.5 s or more that follows a change, and a longer stretch is split at its next wait of 0.2 s or more (constants at the top of `slidev/manim/runner.ts`).
Call `t.step()` to put one somewhere else.
A scene's waits are its beats: put a `t.wait()` (or `t.step()`) wherever the presenter should stop.

## Helpers

- `mn.ts` (`slidev/manim/`):
  - Manim's colors and directions (`YELLOW`, `UP`, ...)
  - `pt(x, y)`
  - `txt(s, {size, color, mono, bold})` (sizes calibrated to match Python)
  - `rect`, `roundedRect`, `dashedBox`, `surround`, `arrow`, `corner(m, DIR)`, `dur(anim, s)`
  - `strokeTo`, `cameraFrame` / `setCamera`, `growArrow`, `Indicate` and `VGroup` (see the gotchas)
  - `t.lagged(rt, lag, ...anims)` for `LaggedStart` (`await t.play(rt, t.lagged(rt, lag, ...anims))`)
- `code.ts`:
  - `codeLines` (monospace code, one Text per line, indentation kept)
  - `tokenBox` (a box around a token)
- Shared code a deck needs (ports of its Python `lib/`: base classes, layouts, ...) lives beside its scenes, importing from `lump-manim/...`.
  Add to lump's `slidev/manim/` only what is useful in every deck, in the same style, without changing what other scenes use.

## manim-web gotchas

- Use `VGroup` from `lump-manim/mn`, never manim-web's: manim-web keeps a transform on a moved group and gives its children *local* coordinates, so `child.getCenter()` and `child.copy()` come out in the wrong place
- `GrowArrow` draws nothing, and `Create(arrow)` shows the tip first: use `growArrow(arrow)`
- `Indicate` leaves filled shapes with the wrong fill: use `Indicate` from `lump-manim/mn` (the runner also handles animating a child of a displayed group, which would otherwise hide its siblings)
- `Text` is a canvas texture, not vector glyphs: Python code that indexes a Text's glyphs must compute the box from the monospace metrics instead (`tokenBox`).
  Python's `Text` also drops leading blanks (`codeLines`).
- Colors: `m.setStyle({ strokeColor: c })` for `set_stroke(c)`; `m.setColor(c)` changes stroke *and* fill; `m.setFill(c, opacity)` for `set_fill`. `animate.setStyle` does nothing on groups: use `strokeTo`
- `FadeIn(x, shift=RIGHT*0.25)` is `new FadeIn(x, { shift: [0.25, 0, 0] })`
  `FadeOut(x, target_position=p)` has no equivalent: use `new FadeOut(x, { shift: p - x.center })` (a move-and-fade of a copy)
  `.animate.setOpacity` does not exist on Text
- Names: `next_to(m, DIR, buff=)` is `nextTo(m, DIR, buff)`, `move_to(p, aligned_edge=LEFT)` is `moveTo(p, LEFT)`, `get_center()` is `getCenter()`, `set_opacity` is `setOpacity`, `width` / `height` are `getWidth()` / `getHeight()`, `VGroup(*list)` is `new VGroup(...list)`.
  Constructors take an options object.
- Camera: the real scene is `t.scene` (`t.scene.camera`); use `cameraFrame` / `setCamera` (the runner resets the camera on every run)
- Don't share an animation between two `play()` calls: make a fresh one each time
- Seeking re-runs the script with rendering off, so keep it free of heavy per-call work
- The types are in `node_modules/manim-web/dist/**/*.d.ts`, the implementation in `manim-web.browser.js`.
  The Python Manim library, in the Python environment you render with, shows what a Python call did.

## Checking a port

1. `lump start <deck.md>`, and open the scene's slide
   The page's player is `document.querySelector('.manim').__runner`, which has `seek(seconds, false)`, `total`, `waypoints` and `step`.
2. Compare frames with the Python render (`ffmpeg -ss <T> -i <Scene>.mp4 -frames:v 1 out.png`) at several times, after each phase and at the end.
   Look for missing or misplaced objects, wrong colors, overlapping text, objects that are not removed, and misaligned glyph boxes.
3. Compare the total duration with the video's (within about 5%).
4. Check that seeking is consistent: the frame at time T must look the same whether reached directly or after seeking elsewhere first
5. Watch the browser console for errors

Faithful look and behavior is the goal, not pixel identity.

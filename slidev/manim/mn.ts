/**
 * A thin layer over manim-web that makes it read like the Python Manim scripts
 * these scenes were ported from: Manim's color names, direction vectors, and
 * small constructors with Python-style names for the shapes and text we use.
 */
import { Rectangle, RoundedRectangle, Text, Arrow, SurroundingRectangle, DashedVMobject, Mobject, VGroup as ManimVGroup, Animation, UpdateFromFunc, UpdateFromAlphaFunc, Indicate as ManimIndicate } from 'manim-web';
import type { AnimationOptions } from 'manim-web';

/** What a scene's code is given: see runner.ts */
import type { Timed } from './runner';
export type { Timed };
export type Scene = Timed;

export type V3 = [number, number, number];

// ---- Manim CE's colors
export const WHITE = '#FFFFFF';
export const BLACK = '#000000';
export const GREY_B = '#BBBBBB';
export const GREY_D = '#444444';
export const GREY_E = '#222222';
export const YELLOW = '#FFFF00';
export const YELLOW_B = '#FFEA94';
export const BLUE_C = '#58C4DD';
export const BLUE_D = '#29ABCA';
export const ORANGE = '#FF862F';
export const RED = '#FC6255';
export const GREEN = '#83C167';
export const GREEN_C = '#83C167';

// ---- Manim's direction vectors
export const UP: V3 = [0, 1, 0];
export const DOWN: V3 = [0, -1, 0];
export const LEFT: V3 = [-1, 0, 0];
export const RIGHT: V3 = [1, 0, 0];
export const UL: V3 = [-1, 1, 0];
export const UR: V3 = [1, 1, 0];
export const DL: V3 = [-1, -1, 0];
export const DR: V3 = [1, -1, 0];

export const MONO = "'DejaVu Sans Mono', 'Menlo', 'Consolas', monospace";
/** Manim's default Text font on the machine the Python scenes were made on */
export const SANS = "'DejaVu Serif', 'Georgia', serif";
/**
 * manim-web draws text smaller than Manim CE does at the same `font_size`
 * (measured: about 1.25x for DejaVu Sans Mono), so sizes are scaled up to match.
 */
const FONT_SCALE = 1.25;

/** A point on the z=0 plane */
export const pt = (x: number, y: number): V3 => [x, y, 0];

/** Python's `Text(s, font_size=..., color=..., font=...)` */
export function txt(s: string, o: { size?: number; color?: string; mono?: boolean; bold?: boolean } = {}): Text {
  return new Text({
    text: s,
    fontSize: (o.size ?? 48) * FONT_SCALE,
    color: o.color ?? WHITE,
    fontFamily: o.mono ? MONO : SANS,
    fontWeight: o.bold ? 'bold' : 'normal',
  });
}

/** Python's `Rectangle(width=, height=, stroke_color=, stroke_width=, fill_color=, fill_opacity=)` */
export function rect(o: { w: number; h: number; stroke?: string; sw?: number; fill?: string; fillOpacity?: number }): Rectangle {
  const r = new Rectangle({ width: o.w, height: o.h, color: o.stroke ?? WHITE, strokeWidth: o.sw ?? 2 });
  if (o.fill) r.setFill(o.fill, o.fillOpacity ?? 1);
  return r;
}

export function roundedRect(o: { w: number; h: number; radius: number; stroke: string; sw?: number }): RoundedRectangle {
  return new RoundedRectangle({ width: o.w, height: o.h, cornerRadius: o.radius, color: o.stroke, strokeWidth: o.sw ?? 2 });
}

/** A dashed outline around a mobject (Python: `DashedVMobject(SurroundingRectangle(...), num_dashes=n)`) */
export function dashedBox(m: Mobject, o: { color?: string; buff?: number; n?: number } = {}): DashedVMobject {
  const box = new SurroundingRectangle(m, { color: o.color ?? YELLOW, buff: o.buff ?? 0.06 });
  return new DashedVMobject({ vmobject: box, numDashes: o.n ?? 36 });
}

export function surround(m: Mobject, o: { color?: string; buff?: number; sw?: number } = {}): SurroundingRectangle {
  return new SurroundingRectangle(m, { color: o.color ?? YELLOW, buff: o.buff ?? 0.05, strokeWidth: o.sw ?? 3 });
}

/** The center of the mobject's bounding box's edge/corner in direction `d` (Python's `get_corner`/`get_top`/...) */
export function corner(m: Mobject, d: V3): V3 {
  const b = m.getBounds();
  const x = d[0] < 0 ? b.min.x : d[0] > 0 ? b.max.x : (b.min.x + b.max.x) / 2;
  const y = d[1] < 0 ? b.min.y : d[1] > 0 ? b.max.y : (b.min.y + b.max.y) / 2;
  return [x, y, 0];
}

export function arrow(start: V3, end: V3, o: { color?: string; sw?: number } = {}): Arrow {
  return new Arrow({ start, end, color: o.color ?? GREY_B, strokeWidth: o.sw ?? 2.5, tipLength: 0.2, tipWidth: 0.14 });
}

/** Set an animation's length (Python's `run_time=`); the animation must not have started */
export function dur<A extends Animation>(a: A, seconds: number): A {
  Object.defineProperty(a, 'duration', { value: seconds, writable: true, configurable: true });
  return a;
}

/**
 * Manim's `self.camera.frame.animate.set(width=w).move_to(center)`: zoom/pan the view over the animation. (manim-web's
 * MovingCameraScene moves its camera with its own timers, which can't be paused or seeked, and changing the camera's
 * frame size would rescale newly created text, so this zooms the orthographic camera instead.)
 * The runner puts the camera back at the start of every run.
 */
export function cameraFrame(t: Timed, width: number, center: V3, o: AnimationOptions = {}): Animation {
  const cam = t.scene.camera;
  const three = cam.getCamera();
  const w0 = cam.frameWidth;
  const startW = w0 / three.zoom;
  const start = [cam.position.x, cam.position.y];
  const z = cam.position.z;
  return new UpdateFromAlphaFunc(
    new VGroup(),
    (_, a) => {
      three.zoom = w0 / (startW + (width - startW) * a);
      three.updateProjectionMatrix();
      cam.moveTo([start[0] + (center[0] - start[0]) * a, start[1] + (center[1] - start[1]) * a, z]);
    },
    o,
  );
}

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, k: number) =>
  '#' + hex(a).map((x, i) => Math.round(x + (hex(b)[i] - x) * k).toString(16).padStart(2, '0')).join('');

/**
 * Manim's `m.animate.set_stroke(color, width)`: change the outline color (and width) of a shape, or of every shape in a
 * group, leaving fills alone. (manim-web's `animate.setStyle` does nothing on groups, and `setColor` recolors the fill too.)
 */
export class StrokeTo extends Animation {
  private shapes: { m: Mobject; color: string; fill: string | undefined; fillOpacity: number; width: number }[] = [];
  constructor(m: Mobject, private color: string, private width?: number, o: AnimationOptions = {}) {
    super(m, o);
  }
  begin() {
    super.begin();
    this.shapes = this.mobject
      .getFamily()
      .filter((m) => m.children.length === 0)
      .map((m) => ({ m, color: m.color, fill: (m as any).fillColor, fillOpacity: (m as any).fillOpacity ?? 0, width: (m as any).strokeWidth ?? 4 }));
  }
  interpolate(a: number) {
    for (const s of this.shapes) {
      s.m.setColor(mix(s.color, this.color, a)); // (sets the fill too...)
      if (s.fill) s.m.setFill(s.fill, s.fillOpacity); // ...so put it back
      s.m.setFillOpacity(s.fillOpacity);
      if (this.width !== undefined) s.m.setStrokeWidth(s.width + (this.width - s.width) * a);
    }
  }
  finish() {
    this.interpolate(1);
    super.finish();
  }
}
export const strokeTo = (m: Mobject, color: string, width?: number, o: AnimationOptions = {}) => new StrokeTo(m, color, width, o);

/** Python's `self.camera.frame.set(width=w).move_to(center)`: set the view instantly (see {@link cameraFrame}) */
export function setCamera(t: Timed, width: number, center: V3) {
  const cam = t.scene.camera;
  const three = cam.getCamera();
  three.zoom = cam.frameWidth / width;
  three.updateProjectionMatrix();
  cam.moveTo([center[0], center[1], cam.position.z]);
}

/**
 * Manim's GrowArrow: the arrow grows from its tail, tip first at the tail and then moving out with the head.
 * (manim-web's own GrowArrow draws nothing, and `Create` shows the tip before the shaft.)
 */
export function growArrow(a: Arrow, o: AnimationOptions = {}): Animation {
  const s = a.getStart();
  const e = a.getEnd();
  const len = Math.hypot(e[0] - s[0], e[1] - s[1]);
  const tip = a.getTipLength();
  const tipW = a.getTipWidth();
  return new UpdateFromFunc(
    a,
    (m, alpha) => {
      const k = Math.max(alpha, 1e-3);
      const arr = m as Arrow;
      // the tip grows with the shaft instead of appearing at full size
      const f = Math.min(1, (k * len) / (2 * tip));
      arr.setTipLength(tip * f);
      arr.setTipWidth(tipW * f);
      arr.putStartAndEndOn(s, [s[0] + (e[0] - s[0]) * k, s[1] + (e[1] - s[1]) * k, 0]);
    },
    o,
  );
}

/**
 * Manim's Indicate. manim-web's own leaves a filled shape's fill the stroke
 * color afterwards, so this puts every style back at the end.
 */
export class Indicate extends ManimIndicate {
  private saved: [Mobject, string, string | undefined, number][] = [];
  constructor(m: Mobject, o: AnimationOptions & { scaleFactor?: number; color?: string } = {}) {
    super(m, { color: YELLOW, ...o });
  }
  begin() {
    // (the real `fillOpacity` property, not `style.fillOpacity`, which can be stale)
    this.saved = this.mobject.getFamily().map((m) => [m, m.color, m.style.fillColor, (m as any).fillOpacity ?? 0]);
    super.begin();
  }
  finish() {
    super.finish();
    for (const [m, color, fill, fillOpacity] of this.saved) {
      m.setColor(color); // sets the fill too...
      if (fill) m.setFill(fill, fillOpacity); // ...so put the fill back
      m.setFillOpacity(fillOpacity);
    }
  }
}

/**
 * A VGroup whose moves (shift/moveTo/scale/nextTo/...) are baked into its children, as in Python Manim.
 * manim-web instead keeps a transform on the group and gives children coordinates relative to it, so a child's
 * getCenter()/getBounds()/copy() would come out in the wrong place once the group has been moved.
 * Use this VGroup (not manim-web's) everywhere, and for the classes in orecs.ts/tour.ts.
 */
export class VGroup extends ManimVGroup {
  private bake(): this {
    this.normalizeTransform();
    return this;
  }
  shift(delta: V3) {
    super.shift(delta);
    return this.bake();
  }
  moveTo(target: V3 | Mobject, alignedEdge?: V3) {
    super.moveTo(target, alignedEdge);
    return this.bake();
  }
  scale(factor: number | V3) {
    super.scale(factor as any);
    return this.bake();
  }
  nextTo(target: Mobject | V3, direction?: V3, buff?: number) {
    super.nextTo(target, direction, buff);
    return this.bake();
  }
  alignTo(target: Mobject | V3, direction: V3) {
    super.alignTo(target, direction);
    return this.bake();
  }
  rotate(angle: number, axis?: any) {
    super.rotate(angle, axis);
    return this.bake();
  }
  copy(): VGroup {
    const c = new VGroup(...this.children.map((ch) => ch.copy()));
    return c;
  }
}

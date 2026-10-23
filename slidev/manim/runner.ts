/**
 * Runs a scene script with video-player controls: pause/resume, restart, and
 * seeking to any time.
 *
 * manim-web's own Player records a scene's play() calls and replays them, which
 * loses the state a script changes in between (text swaps, add/remove order),
 * so scenes written the way Python Manim scenes are would break. Instead, a
 * scene is an ordinary async script, run as written, and seeking is done by
 * running it again from the start with every animation before the target time
 * completed instantly ("fast-forward"). Scenes are deterministic, so this
 * reproduces the state exactly. The scene's total length comes from one
 * complete fast-forward run.
 *
 * A scene calls `t.play(seconds, ...animations)` and `t.wait(seconds)` on the
 * {@link Timed} it is given, never the manim-web scene directly.
 */
import { Scene, Animation, Mobject, LaggedStart } from 'manim-web';

/**
 * Step mode. A scene's waypoints are the moments between its beats: the script time just before each `wait` of at
 * least BEAT seconds that follows some change, and before every explicit `t.step()`; a long stretch with neither is
 * split (see SPLIT_AFTER). Stepping forward runs the script from one waypoint to the next in a fraction of a second
 * (its animations sped up, its waits skipped), or at once ("snap"); stepping back re-runs the script to the previous
 * waypoint.
 */
const BEAT = 0.5;
/** A stretch of the scene longer than this (in script seconds) is split at its next wait of at least SPLIT_WAIT */
const SPLIT_AFTER = 4;
const SPLIT_WAIT = 0.2;
/** Waypoints closer together than this are merged */
const MIN_GAP = 0.3;
/** A step takes this fraction of its script time to play, but no less than TRANSITION_MIN and no more than TRANSITION_MAX seconds */
const TRANSITION_SHARE = 0.2;
const TRANSITION_MIN = 0.35;
const TRANSITION_MAX = 1.2;
const EPS = 1e-6;

/** Thrown inside a scene that has been superseded by a restart or seek, to unwind it */
class Cancelled extends Error {}

export type RunState = 'idle' | 'playing' | 'paused' | 'ended';

/** What a scene script sees: Python's `self.play(..., run_time=)`, `self.wait()`, `self.add()`, `self.remove()` */
export class Timed {
  /** Scales every duration (Python's `Timed.sp`) */
  sp = 1;
  /**
   * Reproduce a quirk of the Python `Timed` scene base class: its `wait(d)` ends up lasting `sp` seconds whatever `d`
   * is (Scene.wait plays a Wait animation through the overridden play(), which forces run_time = 1.0 * sp). The
   * rendered videos have that timing, so scenes ported from a `Timed` scene set this to keep it.
   */
  legacyWait = false;
  constructor(private r: Runner, public scene: Scene) {}
  play(rt: number, ...anims: Animation[]) {
    return this.r.runPlay(rt * this.sp, anims);
  }
  wait(t = 1) {
    return this.r.runWait(this.legacyWait ? this.sp : t * this.sp);
  }
  /** Python's `LaggedStart(*anims, lag_ratio=lag)` played with `run_time=rt`: pass the result to `play(rt, ...)` */
  lagged(rt: number, lag: number, ...anims: Animation[]) {
    const each = (rt * this.sp) / (1 + lag * (anims.length - 1));
    for (const a of anims) Object.defineProperty(a, 'duration', { value: each, writable: true, configurable: true });
    return new LaggedStart(anims, { lagRatio: lag });
  }
  add(...m: Mobject[]) {
    this.r.markChange();
    this.scene.add(...m);
  }
  remove(...m: Mobject[]) {
    this.r.markChange();
    this.scene.remove(...m);
  }
  /** Mark a waypoint here, for step mode (waits of half a second or more are waypoints already) */
  step() {
    this.r.markStep();
  }
}

export class Runner {
  /** Length of the scene in seconds (known once the first run has finished) */
  total = 0;
  state: RunState = 'idle';
  onChange?: () => void;

  private gen = 0; // incremented on every restart; older runs see the change and unwind
  private clock = 0; // script time reached so far
  private target: number | null = 0; // fast-forward until this script time; null = no fast-forwarding (real time)
  private resumeAfterSeek = false;
  private dry = false; // a run that only measures the scene's length
  private segStart = 0; // script time at which the current play/wait began
  private segKind: 'none' | 'play' | 'wait' = 'none';
  private segEnd = 0; // script time at which the current play/wait ends
  private waitElapsed = 0;
  private gate?: () => void; // wakes the script paused at the seek target
  private sleeper?: { wake: () => void };
  private settle?: () => void; // wakes whoever is awaiting run(): the seek target was reached, or the script ended

  /** Script times of the waypoints (see BEAT), the first being the start; found by the first (measuring) run */
  waypoints: number[] = [0];
  private changed = false; // (measuring run) something happened since the last waypoint
  private tween = false; // moving forward to the next waypoint in real time, sped up
  private tweenScale = 1;
  private stepTarget = 0; // the waypoint being moved to

  constructor(private scene: Scene, private script: (t: Timed) => Promise<void>) {
    // manim-web adds the target of every animation to the scene. For a *child* of something already shown (say
    // `Indicate(orec.box)`) that re-adds the child as a top-level object with a newer draw order, so it is drawn
    // on top of its siblings (the orec's text disappears behind its box). Python Manim animates it in place.
    const add = scene.add.bind(scene);
    scene.add = (...ms: Mobject[]) => {
      const inScene = (m: Mobject): boolean => {
        for (let p = m.parent as Mobject | null | undefined; p; p = p.parent as Mobject | null | undefined) {
          if (scene.mobjects.has(p)) return true;
        }
        return false;
      };
      return add(...ms.filter((m) => !inScene(m)));
    };
  }

  // ------------------------------------------------------------------ controls
  /** Script time shown on the scrub bar */
  get time(): number {
    // While seeking (fast-forwarding to the target), show the target, not the script racing to it
    if (!this.dry && this.target !== null) return this.target;
    if (this.segKind === 'play') return Math.min(this.segStart + this.scene.currentTime, this.clock);
    if (this.segKind === 'wait') return this.segStart + this.waitElapsed;
    return this.clock;
  }

  /** Measure the scene (and find its waypoints), then show its first frame (`poster` seconds in) */
  async init(poster: number) {
    this.dry = true;
    this.waypoints = [0];
    this.changed = false;
    await this.run(null, false);
    this.total = this.clock;
    if (this.changed) this.waypoints.push(this.total);
    this.dry = false;
    await this.seek(poster, false);
  }

  /** (Measuring run) record a waypoint at the current script time, if anything has happened since the last one */
  markStep() {
    if (!this.dry || !this.changed || this.clock - this.waypoints[this.waypoints.length - 1] < MIN_GAP) return;
    this.waypoints.push(this.clock);
    this.changed = false;
  }

  /** Note that the scene changed (see markStep) */
  markChange() {
    this.changed = true;
  }

  // ------------------------------------------------------------------ steps
  /** The waypoint the scene is at (or moving to): the last one at or before the current time */
  get step(): number {
    const t = this.time + EPS;
    let i = 0;
    while (i + 1 < this.waypoints.length && this.waypoints[i + 1] <= t) i++;
    return i;
  }

  /** Moving forward to the next waypoint */
  get stepping(): boolean {
    return this.tween;
  }

  /** Go to waypoint `i` at once (a full re-run: for stepping back, or jumping around) */
  async goStep(i: number) {
    const to = this.waypoints[Math.max(0, Math.min(i, this.waypoints.length - 1))];
    this.tween = false;
    await this.run(to, false);
  }

  /**
   * Move to the next waypoint: the scene's animations run sped up (or, with `snap`, are skipped), continuing from
   * where the script is stopped, so this costs only the one step. If a step is still in progress, it is completed
   * first.
   */
  async next(snap = false) {
    if (this.tween) await this.goStep(this.step);
    const i = this.step;
    if (i >= this.waypoints.length - 1) return;
    if (!this.gate || this.dry) return this.goStep(i + 1); // (not stopped at a waypoint: start over)
    const to = this.waypoints[i + 1];
    this.target = to;
    this.stepTarget = to;
    this.resumeAfterSeek = false;
    this.tween = !snap;
    const len = to - this.waypoints[i];
    this.tweenScale = Math.min(1, Math.max(TRANSITION_MIN, Math.min(TRANSITION_MAX, len * TRANSITION_SHARE)) / len);
    const arrived = new Promise<void>((resolve) => (this.settle = resolve));
    this.autoRender(this.tween);
    this.setState(this.tween ? 'playing' : 'paused');
    this.gate();
    await arrived;
  }

  play() {
    if (this.state === 'ended') return void this.seek(0, true);
    if (this.state !== 'paused') return;
    this.setState('playing');
    if (this.gate) {
      this.target = null;
      this.gate();
    } else this.scene.resume();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.scene.pause();
  }

  toggle() {
    if (this.state === 'playing') this.pause();
    else this.play();
  }

  /** Jump to script time `time` (clamped to the scene), then play or stay paused */
  async seek(time: number, thenPlay = this.state === 'playing') {
    if (!thenPlay && this.nudge(time)) return;
    await this.run(Math.max(0, Math.min(time, this.total || Infinity)), thenPlay);
  }

  /**
   * A cheap seek, for stepping through a paused animation frame by frame: when the target is inside the animation
   * (or wait) the player is stopped in, move within it instead of re-running the script from the start. Returns
   * false (having done nothing) when it can't, and then a full seek is needed.
   */
  private nudge(time: number): boolean {
    if (this.state !== 'paused' || this.target !== null || this.segKind === 'none' || this.dry) return false;
    const eps = 1e-3; // (the very end of a segment would finish it, and the script would carry on)
    if (time < this.segStart || time > this.segEnd - eps) return false;
    if (this.segKind === 'play') this.scene.seek(time - this.segStart);
    else {
      this.waitElapsed = time - this.segStart;
      this.scene.render();
    }
    return true;
  }

  dispose() {
    this.gen++;
    this.gate?.();
    this.sleeper?.wake();
    this.scene.dispose();
  }

  // ------------------------------------------------------------------ running
  private setState(s: RunState) {
    this.state = s;
    this.onChange?.();
  }

  private async run(target: number | null, thenPlay: boolean) {
    const gen = ++this.gen;
    this.gate?.();
    this.sleeper?.wake();
    this.scene.stop();
    this.scene.clear({ render: false });
    this.resetCamera();
    this.clock = 0;
    this.segKind = 'none';
    this.tween = false;
    this.target = target;
    this.resumeAfterSeek = thenPlay;
    this.autoRender(!this.dry && target === null); // fast-forwarding (or measuring): no drawing until we stop
    // (A seek made while playing stays 'playing', so the player's controls don't flicker)
    this.setState(this.dry ? 'idle' : thenPlay ? 'playing' : 'paused');
    const settled = new Promise<void>((resolve) => (this.settle = resolve));
    (async () => {
      try {
        await this.script(new Timed(this, this.scene));
        if (gen !== this.gen) return;
        this.segKind = 'none';
        if (!this.dry) {
          await this.show(gen);
          this.autoRender(true);
          this.setState('ended');
        }
      } catch (e) {
        if (!(e instanceof Cancelled)) console.error('manim scene failed:', e);
      } finally {
        if (gen === this.gen) this.settle?.();
      }
    })();
    await settled; // not the whole script: it may play on in real time
  }

  /** Scenes may zoom/pan the camera (see cameraFrame in mn.ts); every run starts from the default view */
  private resetCamera() {
    const cam = this.scene.camera;
    const three = cam.getCamera();
    three.zoom = 1;
    three.updateProjectionMatrix();
    cam.moveTo([0, 0, cam.position.z]); // (z is the camera's distance: keep it)
  }

  /** While fast-forwarding, don't draw after every add/remove (each is a full render); draw once at the end */
  private autoRender(on: boolean) {
    (this.scene as any)._autoRender = on;
  }

  private check(gen: number) {
    if (gen !== this.gen) throw new Cancelled();
  }

  /**
   * Draw the scene once everything in it is ready. Text is rendered asynchronously, so a frame drawn right after
   * a fast-forward (no real playback to keep redrawing) would show blank text.
   */
  private async show(gen: number) {
    const waits: Promise<unknown>[] = [];
    const visit = (m: any) => {
      if (typeof m.waitForRender === 'function') waits.push(m.waitForRender().catch(() => {}));
      for (const c of m.children ?? []) visit(c);
    };
    for (const m of this.scene.mobjects) visit(m);
    await Promise.all(waits);
    this.check(gen);
    this.scene.render();
  }

  /** At the seek target: stop here, unless the seek was made while playing */
  private async atTarget(gen: number) {
    if (this.dry || this.target === null || this.clock < this.target) return;
    this.segKind = 'none';
    this.tween = false;
    await this.show(gen);
    this.autoRender(true);
    // (pause() may have been called while fast-forwarding: then stay paused)
    if (this.resumeAfterSeek && this.state === 'playing') {
      this.target = null;
      this.settle?.();
      return;
    }
    this.setState('paused');
    this.settle?.();
    await new Promise<void>((resolve) => (this.gate = resolve));
    this.gate = undefined;
    this.check(gen);
  }

  /** A scene's `play` (see {@link Timed}) */
  async runPlay(d: number, anims: Animation[]) {
    const gen = this.gen;
    await this.atTarget(gen);
    this.changed = true;
    const real = this.tween ? d * this.tweenScale : d; // (how long it really takes)
    for (const a of anims) Object.defineProperty(a, 'duration', { value: real, writable: true, configurable: true });
    if (this.tween) {
      // (an animation made of others, e.g. a lagged start, keeps its own timing: speed that up too)
      for (const a of this.flatten(anims)) {
        if (!anims.includes(a)) Object.defineProperty(a, 'duration', { value: a.duration * this.tweenScale, writable: true, configurable: true });
      }
    }
    if (this.dry || (!this.tween && this.target !== null && this.clock + d <= this.target)) {
      this.fastForward(anims);
      this.clock += d;
      return;
    }
    this.segStart = this.clock;
    this.segKind = 'play';
    this.clock += d;
    this.segEnd = this.clock;
    const finished = this.scene.play(...anims);
    if (!this.tween && this.target !== null && this.target > this.segStart) {
      // The target is inside this animation: show that moment and stop there
      // (`timeline` can be left over from an earlier play; `isPlaying` is true only once this one has started)
      while (!this.scene.isPlaying) await new Promise((r) => requestAnimationFrame(r));
      this.check(gen);
      this.autoRender(true);
      this.scene.pause();
      this.scene.seek(this.target - this.segStart);
      this.target = null; // consumed: whatever comes next runs in real time
      this.settle?.();
      if (this.resumeAfterSeek && this.state === 'playing') {
        this.scene.resume();
      } else {
        this.setState('paused');
      }
    }
    await finished;
    this.check(gen);
    this.segKind = 'none';
  }

  /** A scene's `wait` */
  async runWait(d: number) {
    const gen = this.gen;
    await this.atTarget(gen);
    if (this.dry && (d >= BEAT || (d >= SPLIT_WAIT && this.clock - this.waypoints[this.waypoints.length - 1] >= SPLIT_AFTER))) {
      this.markStep();
    }
    if (this.tween) {
      // Moving between waypoints: a beat is skipped, and a shorter wait sped up like the animations
      if (d < BEAT) {
        await new Promise<void>((resolve) => {
          const id = setTimeout(resolve, d * this.tweenScale * 1000);
          this.sleeper = { wake: () => (clearTimeout(id), resolve()) };
        });
        this.sleeper = undefined;
        this.check(gen);
      }
      this.clock += d;
      return;
    }
    if (this.dry || (this.target !== null && this.clock + d <= this.target)) {
      this.clock += d;
      return;
    }
    // Part of the wait may be before the target
    let left = d;
    if (this.target !== null && this.target > this.clock) {
      left = this.clock + d - this.target;
      this.clock = this.target;
      await this.atTarget(gen);
    }
    this.segStart = this.clock;
    this.segKind = 'wait';
    this.segEnd = this.segStart + left;
    this.waitElapsed = 0;
    this.scene.render();
    await new Promise<void>((resolve) => {
      let last = performance.now();
      let raf = 0;
      this.sleeper = {
        wake: () => {
          cancelAnimationFrame(raf);
          resolve();
        },
      };
      const tick = (now: number) => {
        if (gen !== this.gen) return resolve();
        if (this.state === 'playing') this.waitElapsed += (now - last) / 1000;
        last = now;
        if (this.waitElapsed >= left) return resolve();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    this.sleeper = undefined;
    this.check(gen);
    this.clock = this.segStart + left;
    this.segKind = 'none';
  }

  /** Complete animations instantly, as a normal play() would have by its end */
  private fastForward(anims: Animation[]) {
    const all = this.flatten(anims);
    for (const a of all) {
      const m = a.mobject as any;
      if (m._dirty) {
        m._syncToThree();
        m._dirty = false;
      }
    }
    for (const a of anims) a.begin();
    for (const a of all) if (!this.scene.mobjects.has(a.mobject)) this.scene.add(a.mobject);
    for (const a of anims) {
      a.interpolate(1);
      a.finish();
    }
    for (const a of all) a.cleanUpFromScene(this.scene);
  }

  private flatten(anims: Animation[]): Animation[] {
    const out: Animation[] = [];
    for (const a of anims) {
      out.push(a);
      const inner = (a as any).animations as Animation[] | undefined;
      if (inner) out.push(...this.flatten(inner));
    }
    return out;
  }
}

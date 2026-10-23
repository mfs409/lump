<script setup lang="ts">
/**
 * A live manim-web animation, in place of a rendered video. `<Manim src="tour" />`
 * runs the scene module `manim/tour.ts` in the deck's folder, whose default export is
 * `async (t) => { ... }` (see manim/lib/runner.ts).
 *
 * It has two modes, switched by the button at the right of the controls (the choice is remembered):
 *
 * Steps (the default): the animation is divided into steps (see `BEAT` in manim/lib/runner.ts, and `t.step()`), and
 * the presenter moves through them, each one a short transition (or, with the snap button, at once). Click the
 * picture (or the buttons), then:
 *
 * - Right / Space / . / PageDown, or a click: next step     - Left / , / PageUp: previous step
 * - Home / End: first / last step                           - S: snap on / off      - V: video mode
 * - Esc: give the keys back to Slidev
 *
 * Right and Space (and Left) at the last (first) step are left to Slidev, which goes on to the next (previous) slide.
 *
 * Video: like `<Vid>`, nothing plays until asked. Click it (or the buttons), then:
 *
 * - Space / K: play / pause      - Left / Right: -/+ 5 seconds (Shift: 1 s)
 * - , / .: step back / forward a frame (pauses)
 * - Home / 0: restart            - End: jump to the end          - V: step mode
 * - Esc: give the keys back to Slidev
 *
 * Jumps (buttons, keys, the scrub bar) keep playing if it was playing.
 * The controls are drawn over the bottom of the picture, and hide while it
 * plays (move the mouse over it to show them), so that they stay clear of
 * Slidev's own navigation buttons at the bottom left of the window.
 *
 * It pauses and rewinds when its slide is left. In a printed (PDF) deck it
 * shows its last frame.
 */
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import * as manim from 'manim-web';
import { Runner } from '../manim/runner';
import type { Timed } from '../manim/mn';
import { mode, snap } from '../manim/prefs';

const props = defineProps<{ src: string; height?: number }>();

/** Where the scene rests when not played, in seconds (skips a blank first frame, like <Vid>) */
const START = 0.1;

/** Slidev's printable page (what `lump slides2pdf` prints): every slide is shown at once, so show each animation's last frame */
const printing = typeof location !== 'undefined' && (location.pathname.includes('/export') || new URLSearchParams(location.search).has('print'));
const FRAME = 1 / 15;

const scenes = import.meta.glob('/manim/*.ts');

const root = ref<HTMLElement>();
const stage = ref<HTMLElement>();
const h = props.height ?? 400;
const w = Math.round((h * 16) / 9);
/**
 * The picture is drawn this many times larger than it is laid out (the canvas is scaled down by the style below),
 * because Slidev scales the slide up to fit the window, which would blur a canvas drawn at its layout size.
 */
const RES = 2;

const runner = shallowRef<Runner>();
const time = ref(0);
const total = ref(0);
const state = ref('idle');
/** Step mode: the current step, how many there are, and whether moving to the next one */
const step = ref(0);
const steps = ref(1);
const stepping = ref(false);
const error = ref('');
/** The scrub bar is being dragged: it shows the pointer's position, not the playing time */
const dragging = ref(false);
const dragTime = ref(0);
let io: IntersectionObserver | undefined;
let raf = 0;
let alive = true;
let booted = false;

async function loadScript(): Promise<(t: Timed) => Promise<void>> {
  const load = scenes[`/manim/${props.src}.ts`];
  if (!load) throw new Error(`no scene manim/${props.src}.ts (next to the deck)`);
  return ((await load()) as any).default;
}

/** Keep the controls' numbers up to date */
function sync() {
  const r = runner.value;
  if (r) {
    time.value = r.time;
    total.value = r.total;
    state.value = r.state;
    step.value = r.step;
    steps.value = r.waypoints.length;
    stepping.value = r.stepping;
  }
}
function tick() {
  sync();
  raf = requestAnimationFrame(tick);
}

/**
 * Jump to a time, keeping playing if `play` is not given and it is playing.
 * A jump re-runs the scene from the start, so while one is in progress, only
 * the latest request is kept (a drag of the scrub bar makes many).
 */
let pending: { time: number; play?: boolean } | null = null;
let seeking: Promise<void> | undefined;
function seekTo(t: number, play?: boolean): Promise<void> {
  pending = { time: t, play };
  seeking ??= (async () => {
    try {
      while (pending && runner.value) {
        const { time: to, play: p } = pending;
        pending = null;
        await runner.value.seek(to, p);
        sync();
      }
    } finally {
      seeking = undefined;
    }
  })();
  return seeking;
}

/** Build the scene and measure it (once, the first time the slide is shown) */
async function boot() {
  try {
    const script = await loadScript();
    if (!alive) return;
    const scene = new manim.Scene(stage.value!, {
      width: w * RES,
      height: h * RES,
      frameWidth: (8 * 16) / 9,
      frameHeight: 8,
      backgroundColor: '#000000',
    });
    runner.value = new Runner(scene, script);
    runner.value.onChange = sync;
    await runner.value.init(START);
    if (printing) await runner.value.seek(runner.value.total, false);
    else if (mode.value === 'steps') await runner.value.seek(0, false);
    (root.value as any).__runner = runner.value; // lets tests drive the player
  } catch (e) {
    error.value = String(e);
    console.error('manim scene failed:', e);
  } finally {
    // (`lump slides2pdf` waits for this, on every animation, before it prints)
    if (root.value) root.value.dataset.ready = error.value ? 'error' : 'yes';
  }
}

onMounted(() => {
  raf = requestAnimationFrame(tick);
  if (printing) {
    // Every slide is laid out at once, most of them below the window, so none can wait to be scrolled into view
    booted = true;
    boot();
    return;
  }
  // Slidev keeps neighboring slides in the DOM, hidden. Build the scene when
  // this one is first shown; rewind it when it is hidden again.
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting && !booted) {
        booted = true;
        boot();
      } else if (!en.isIntersecting && runner.value && !printing) seekTo(mode.value === 'steps' ? 0 : START, false);
    }
  });
  io.observe(root.value!);
});

onBeforeUnmount(() => {
  alive = false;
  cancelAnimationFrame(raf);
  io?.disconnect();
  runner.value?.dispose();
});

const jump = (dt: number) => seekTo((runner.value?.time ?? 0) + dt);

/** Step mode: go to the next step. Returns false (doing nothing) at the last one. */
function stepNext(): boolean {
  const r = runner.value;
  if (!r || r.step >= r.waypoints.length - 1) return false;
  (async () => {
    await seeking;
    await r.next(snap.value);
    sync();
  })();
  return true;
}

/** Step mode: go back to the previous step. Returns false (doing nothing) at the first one. */
function stepPrev(): boolean {
  const r = runner.value;
  if (!r || r.step <= 0) return false;
  seekTo(r.waypoints[r.step - 1], false);
  return true;
}

function stepTo(i: number) {
  const r = runner.value;
  if (r) seekTo(r.waypoints[Math.max(0, Math.min(i, r.waypoints.length - 1))], false);
}

/** Switch between step and video mode; going to step mode stops at the step the video is in */
function setMode(m: 'steps' | 'video') {
  const r = runner.value;
  mode.value = m;
  if (r && m === 'steps') {
    r.pause();
    stepTo(r.step);
  }
}

let swallowKeyup = false;

function key(e: KeyboardEvent) {
  const r = runner.value;
  if (!r) return;
  const k = e.key;
  swallowKeyup = false;
  let handled = true;
  if (k === 'Escape') root.value?.blur();
  else if (k === 'v' || k === 'V') setMode(mode.value === 'steps' ? 'video' : 'steps');
  else if (mode.value === 'steps') {
    if (k === 'ArrowRight' || k === ' ' || k === '.' || k === 'PageDown') handled = stepNext();
    else if (k === 'ArrowLeft' || k === ',' || k === 'PageUp') handled = stepPrev();
    else if (k === 'Home') stepTo(0);
    else if (k === 'End') stepTo(r.waypoints.length - 1);
    else if (k === 's' || k === 'S') snap.value = !snap.value;
    else handled = false;
  } else {
    const dt = e.shiftKey ? 1 : 5;
    if (k === ' ' || k === 'k' || k === 'K') r.toggle();
    else if (k === 'ArrowLeft') jump(-dt);
    else if (k === 'ArrowRight') jump(dt);
    else if (k === ',') (r.pause(), jump(-FRAME));
    else if (k === '.') (r.pause(), jump(FRAME));
    else if (k === 'Home' || k === '0') seekTo(0);
    else if (k === 'End') seekTo(r.total, false);
    else handled = false;
  }
  if (handled) {
    swallowKeyup = k === ' ' || k === 'k' || k === 'K';
    e.preventDefault();
    e.stopPropagation();
  }
}

/** A click on the picture: the next step, or play / pause */
function click() {
  root.value?.focus({ preventScroll: true });
  if (mode.value === 'steps') stepNext();
  else runner.value?.toggle();
}

/** Slidev also looks at the release of a key, so the play/pause keys are consumed on keyup too */
function swallow(e: KeyboardEvent) {
  if (swallowKeyup && [' ', 'k', 'K'].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

/** m:ss (a little is added so that 2.9999999 s, from stepping by frames, shows as 0:03) */
const fmt = (s: number) => {
  const whole = Math.floor(s + 1e-3);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
const playing = computed(() => state.value === 'playing');

/**
 * Dragging the scrub bar: pause while dragging (each position is shown as the
 * pointer moves), and carry on playing afterward if it was playing.
 */
function scrubStart() {
  const r = runner.value;
  if (!r) return;
  const resume = r.state === 'playing';
  dragging.value = true;
  dragTime.value = r.time;
  r.pause();
  const end = async () => {
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    await seeking;
    dragging.value = false;
    if (resume) runner.value?.play();
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}
function scrub(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  dragTime.value = v;
  seekTo(v, false);
}
</script>

<template>
  <div ref="root" class="manim" tabindex="0" @keydown="key" @keyup="swallow">
    <div class="screen" :style="{ width: `${w}px`, height: `${h}px` }">
      <div ref="stage" class="stage" @click="click" />
      <div v-if="error" class="err">{{ error }}</div>
      <div class="bar" :class="{ show: mode === 'video' && (!playing || dragging) }">
        <template v-if="mode === 'steps'">
          <button title="First step (Home)" @click="stepTo(0)">⏮</button>
          <button title="Previous step (Left)" :disabled="step <= 0" @click="stepPrev()">◀</button>
          <button title="Next step (Right)" :disabled="step >= steps - 1" @click="stepNext()">▶</button>
          <input type="range" min="0" :max="steps - 1" step="1" :value="step" @input="stepTo(Number(($event.target as HTMLInputElement).value))" />
          <span class="clock">{{ step + 1 }} / {{ steps }}</span>
          <button :class="{ on: snap }" title="Snap: jump to each step at once, without the transition (S)" @click="snap = !snap">⚡</button>
        </template>
        <template v-else>
        <button title="Restart (Home)" @click="seekTo(0)">⏮</button>
        <button title="Back 5 s (Left)" @click="jump(-5)">⏪</button>
        <button :title="playing ? 'Pause (Space)' : 'Play (Space)'" @click="runner?.toggle()">
          {{ playing ? '⏸' : state === 'ended' ? '↻' : '▶' }}
        </button>
        <button title="Forward 5 s (Right)" @click="jump(5)">⏩</button>
        <input
          type="range"
          min="0"
          :max="total"
          step="0.05"
          :value="dragging ? dragTime : time"
          @pointerdown="scrubStart"
          @input="scrub"
        />
        <span class="clock">{{ fmt(dragging ? dragTime : time) }} / {{ fmt(total) }}</span>
        </template>
        <button
          :title="mode === 'steps' ? 'Step mode: switch to a video player (V)' : 'Video mode: switch to steps (V)'"
          @click="setMode(mode === 'steps' ? 'video' : 'steps')"
        >
          {{ mode === 'steps' ? '☰' : '🎞' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manim {
  text-align: center;
  margin-top: 0.4rem;
  outline: none;
}
.screen {
  position: relative;
  margin: 0 auto;
  max-width: 100%;
  border: 1px solid #ccc;
  background: #000;
}
.stage {
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.stage :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}
.manim:focus .screen {
  border-color: var(--slidev-theme-primary, #502d0e);
  box-shadow: 0 0 0 2px var(--slidev-theme-primary, #502d0e);
}
.err {
  position: absolute;
  inset: 0;
  color: #fc6255;
  padding: 1rem;
  font: 14px monospace;
}
/* The controls, over the bottom of the picture: shown when paused, or while the pointer or the keyboard is on them */
.bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 1.2rem 0.5rem 0.3rem;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  color: #fff;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.2s;
}
.bar.show,
.screen:hover .bar,
.bar:has(:focus-visible) {
  opacity: 1;
}
.bar button:disabled {
  opacity: 0.35;
  cursor: default;
}
.bar button.on {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 3px;
}
.bar button {
  border: 0;
  background: none;
  cursor: pointer;
  font-size: 16px;
  padding: 0 0.2rem;
  color: inherit;
}
.bar input {
  flex: 1;
  accent-color: var(--slidev-theme-primary, #502d0e);
}
.clock {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>

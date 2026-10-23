<script setup lang="ts">
// A video the presenter can control on the fly
//
// - Mouse controls work (play/pause, scrub bar, fullscreen)
// - So do keyboard if the video has focus (via clicking on it; focus goes to the wrapper, see below)
//   - space for play/pause
//   - left/right to move -/+ 5 seconds (shift for 1 second instead)
//   - ',' and '.' to step one frame
//   - home to restart
//   - esc to hand control back to the slide navigation
//
// The video pauses and rewinds itself when you leave the slide.
//
// Usage: put the video tag inside the component:
//
//   <Vid>
//     <video src="/videos/demo.mp4"></video>
//   </Vid>
//
// The picture shown when it is not playing (and in a PDF) is the video at 0.1 seconds, which skips a first frame that
// is often blank. To show another moment, give it in seconds: <Vid :start="3.5">.
import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(defineProps<{ start?: number }>(), { start: 0.1 })

/**
 * The wrapper element; the slot's `<video>` is found inside it once mounted
 */
const root = ref<HTMLElement>()

/**
 * The slot's `<video>` element, once mounted (`undefined` if the slot has none)
 */
let el: HTMLVideoElement | undefined

/**
 * Watches whether the video is on screen, so that it can pause and rewind when
 * its slide is left
 */
let io: IntersectionObserver | undefined

/**
 * Keyboard handler for the video; it only runs while the video has focus.  It
 * prevents Slidev from acting on these keys.
 *
 * @param e The keydown event.
 */
function key(e: KeyboardEvent) {
  if (!el) return
  const k = e.key
  const jump = e.shiftKey ? 1 : 5 // seconds moved by one Left / Right press
  let handled = true // set to false below for keys that are not ours
  if (k === ' ' || k === 'k' || k === 'K') {
    if (el.paused) el.play(); else el.pause();
  }
  else if (k === 'ArrowLeft') el.currentTime = Math.max(0, el.currentTime - jump);
  else if (k === 'ArrowRight') el.currentTime = Math.min(el.duration || 1e9, el.currentTime + jump);
  else if (k === ',') { el.pause(); el.currentTime = Math.max(0, el.currentTime - 1 / 15); }
  else if (k === '.') { el.pause(); el.currentTime = el.currentTime + 1 / 15; }
  else if (k === 'Home' || k === '0') el.currentTime = 0;
  else if (k === 'Escape') root.value?.blur();
  else handled = false;
  if (handled) {
    // keep Slidev (and the browser's default action) from also reacting to this key
    e.preventDefault();
    e.stopPropagation();
  }
}

/**
 * Companion to `key()`: Slidev may also look at the release of a key, so the play/pause keys are consumed on
 * keyup too.
 *
 * @param e The keyup event.
 */
function swallow(e: KeyboardEvent) {
  if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    e.stopPropagation();
  }
}

/** Whenever the video itself gets focus (e.g. by a click on it), move the focus to the wrapper instead. */
function refocus() {
  root.value?.focus({ preventScroll: true });
}

/**
 * Put the video at its resting position, unless it has already been played or
 * scrubbed.  Runs when the video's metadata is available, which is the earliest
 * a seek is allowed.
 */
function park() {
  if (el && el.currentTime === 0) el.currentTime = props.start;
}

/**
 * Once mounted:
 *
 * - Find the slot's `<video>` and give it sensible defaults (controls, metadata preloading, inline playback)
 *   without overriding anything the author wrote.  The video itself is kept out of the tab order.
 * - Start listening for keys on the wrapper, and make the video hand its focus to the wrapper.
 * - Start watching its visibility.  Slidev keeps neighboring slides in the DOM but hides them, so a video
 *   that is playing when the presenter changes slides would otherwise keep playing, unseen.  When the video
 *   stops being visible, pause it and rewind it to its resting position, so each visit to the slide starts
 *   fresh.
 */
onMounted(() => {
  el = root.value?.querySelector('video') ?? undefined
  if (!el) {
    console.warn('<Vid> needs a <video> element inside it, e.g. <Vid><video src="/videos/x.mp4"></video></Vid>')
    return
  }
  if (!el.hasAttribute('controls')) el.controls = true
  if (!el.hasAttribute('preload')) el.preload = 'metadata'
  el.tabIndex = -1
  el.playsInline = true
  root.value?.addEventListener('keydown', key)
  root.value?.addEventListener('keyup', swallow)
  el.addEventListener('focus', refocus)
  el.addEventListener('loadedmetadata', park)
  park()
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting && el) {
        el.pause()
        el.currentTime = props.start
      }
    }
  })
  io.observe(el)
})

/** Stop listening and watching when the component goes away. */
onBeforeUnmount(() => {
  io?.disconnect()
  root.value?.removeEventListener('keydown', key)
  root.value?.removeEventListener('keyup', swallow)
  el?.removeEventListener('focus', refocus)
  el?.removeEventListener('loadedmetadata', park)
})
</script>

<template>
  <div ref="root" class="vid" tabindex="0">
    <slot />
  </div>
</template>

<!-- The video comes from the slot, so it belongs to the deck rather than to this component: reach it with :deep -->
<style scoped>
.vid {
  text-align: center;
  margin-top: 0.4rem;
}

.vid :deep(video) {
  display: block;
  margin: 0 auto;
  height: 400px;
  max-width: 100%;
  border: 1px solid #ccc;
  background: #000;
  outline: none;
}

.vid {
  outline: none;
}

.vid:focus :deep(video) {
  border-color: var(--slidev-theme-primary, #502d0e);
  box-shadow: 0 0 0 2px var(--slidev-theme-primary, #502d0e);
}
</style>

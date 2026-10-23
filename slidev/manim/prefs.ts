/**
 * The viewer's settings, shared by every <Manim> on every slide and remembered between visits:
 *
 * - `mode`: 'steps' (move through the animation a step at a time) or 'video' (play it like a video)
 * - `snap`: in step mode, jump to each step at once instead of animating the change
 */
import { ref, watch } from 'vue';

const KEY = 'lump-manim';

function load(): { mode: 'steps' | 'video'; snap: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { mode: saved.mode === 'video' ? 'video' : 'steps', snap: saved.snap === true };
  } catch {
    return { mode: 'steps', snap: false };
  }
}

const initial = load();
export const mode = ref<'steps' | 'video'>(initial.mode);
export const snap = ref(initial.snap);

watch([mode, snap], () => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ mode: mode.value, snap: snap.value }));
  } catch {
    // (storage can be blocked: the settings then last until the page is closed)
  }
});

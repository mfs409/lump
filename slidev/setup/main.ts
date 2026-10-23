import { defineAppSetup } from '@slidev/types';

/**
 * Slidev swaps in the next slide's ink the moment the slide changes, so it
 * shows up during the slide transition. Hide the ink layer until the
 * transition is over (see the `lump-ink-wait` rule in style.css).
 */
export default defineAppSetup(({ router }) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  router.beforeEach((to, from) => {
    if (to.path === from.path) return; // only a click step, not a new slide
    const root = document.documentElement;
    const seconds = parseFloat(getComputedStyle(root).getPropertyValue('--slidev-transition-duration')) || 0.5;
    root.classList.add('lump-ink-wait');
    clearTimeout(timer);
    timer = setTimeout(() => root.classList.remove('lump-ink-wait'), seconds * 1000);
  });
});

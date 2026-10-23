<script setup lang="ts">
/**
 * The page number ("3 / 10"), in place of the theme's own, which reads the
 * browser's current page and so shows "1" on every slide of slidev's browser
 * exports (/export and /print). `nav.currentSlideRoute` is the slide's own there.
 * The theme's `paginationX`, `paginationY` and `paginationPagesDisabled`
 * settings still work (the theme's own number is hidden in style.css).
 */
import { computed } from 'vue';

const page = computed(() => $slidev.nav.currentSlideRoute.no);
const cfg = computed(() => $slidev.themeConfigs ?? {});
const shown = computed(
  () =>
    page.value !== $slidev.nav.total + 1 &&
    !cfg.value.paginationPagesDisabled?.includes(page.value) &&
    (cfg.value.paginationX || cfg.value.paginationY),
);
const classes = computed(() => [
  cfg.value.paginationX === 'l' ? 'left-0' : 'right-0',
  cfg.value.paginationY === 'b' ? 'bottom-0' : 'top-0',
]);
</script>

<template>
  <div v-if="shown" class="lump-pagination absolute p-2 text-xs" :class="classes">
    {{ page }} / {{ $slidev.nav.total }}
  </div>
</template>

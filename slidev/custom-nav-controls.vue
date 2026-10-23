<script setup lang="ts">
import { nextTick, watch } from 'vue';
import { useNav } from '@slidev/client/composables/useNav.ts';
import { drawingState, patchDrawingState } from '@slidev/client/state/drawings.ts';

const { currentSlideNo, total, go } = useNav();

/**
 * Insert a slide after the current one, then move to it. Ink is stored by
 * slide number, so the ink of every later slide moves down by one.
 */
async function insert(kind: 'duplicate' | 'blank') {
  const no = currentSlideNo.value;
  const count = total.value;
  const last = Math.max(count, ...Object.keys(drawingState).map(Number));
  for (let n = last; n > no; n--) patchDrawingState(n + 1, drawingState[n] ?? '');
  patchDrawingState(no + 1, '');

  const res = await fetch('/__lump/insert-slide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ no, kind }),
  });
  if (!res.ok) {
    console.error('lump: could not insert slide', await res.text());
    return;
  }
  // Slidev reloads the deck from disk; go to the new slide once it's there.
  const stop = watch(total, async (t) => {
    if (t <= count) return;
    stop();
    await nextTick();
    go(no + 1);
  });
}
</script>

<template>
  <template v-if="__SLIDEV_HAS_SERVER__">
    <button class="slidev-icon-btn" title="Duplicate this slide (without ink) after it" @click="insert('duplicate')">
      <div class="i-carbon:copy" />
    </button>
    <button class="slidev-icon-btn" title="Insert a blank slide after this one" @click="insert('blank')">
      <div class="i-carbon:document-add" />
    </button>
  </template>
</template>

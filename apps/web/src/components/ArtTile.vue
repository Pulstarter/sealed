<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
const props = withDefaults(defineProps<{ tile?: number; description: string }>(), { tile: 0 });
const frame = ref<HTMLElement>();
const side = ref(800);
let observer: ResizeObserver | undefined;
const style = computed(() => ({
  width: `${side.value}px`, height: `${side.value}px`,
  backgroundPosition: `${(props.tile % 3) * 50}% ${Math.floor(props.tile / 3) * 50}%`,
}));
onMounted(() => {
  observer = new ResizeObserver(entries => {
    const box = entries[0]?.contentRect;
    if (box) side.value = Math.max(box.width, box.height);
  });
  if (frame.value) observer.observe(frame.value);
});
onUnmounted(() => observer?.disconnect());
</script>

<template>
  <div ref="frame" class="art-frame" role="img" :aria-label="description">
    <div class="art-tile" :style="style"></div>
  </div>
</template>

<style scoped>
.art-frame { position: relative; overflow: hidden; background: #102437; min-width: 0; }
.art-tile { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background-image: url('/art/atlas.png'); background-repeat: no-repeat; background-size: 300% 300%; }
</style>

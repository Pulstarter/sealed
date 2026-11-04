<script setup lang="ts">
withDefaults(defineProps<{state?:'sealed'|'cracked'|'opened';size?:number}>(),{state:'sealed',size:72});
const outline='M40 5 49 7 56 6 61 13 69 16 70 25 76 33 73 41 75 50 68 56 66 65 57 68 50 75 41 73 32 76 24 70 16 68 13 59 6 53 8 44 5 35 10 27 11 19 20 15 25 8 34 9Z';
</script>

<template>
  <span class="e-wax-seal" :class="'e-wax-'+state" :style="{width:size+'px',height:size+'px'}" role="img" :aria-label="state==='opened'?'The envelope has been opened':state==='cracked'?'The seal is ready to open':'The envelope is sealed'">
    <svg v-for="half in ['left','right']" :key="half" viewBox="0 0 80 80" :class="'e-wax-half e-wax-'+half" aria-hidden="true"><path :d="outline" class="e-wax-outline"/><circle cx="40" cy="40" r="23" class="e-wax-ring"/><text x="40" y="51" text-anchor="middle" class="e-wax-glyph">S</text></svg>
    <svg v-if="state!=='sealed'" viewBox="0 0 80 80" class="e-wax-crack" aria-hidden="true"><path d="M39 9 34 24 45 33 35 44 46 56 40 72"/></svg>
  </span>
</template>

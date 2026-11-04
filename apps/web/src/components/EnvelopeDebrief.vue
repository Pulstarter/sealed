<script setup lang="ts">
import type { Debrief } from '../../../../packages/engine/src/types.js';
import { worldTime } from '../lib/presentation';
defineProps<{ debrief: Debrief; start: string }>();
</script>

<template>
  <section class="case-debrief" aria-labelledby="case-truth">
    <p class="eyebrow">The truth kept inside your envelope</p>
    <h2 id="case-truth">What was happening tonight</h2>
    <p class="case-truth">{{ debrief.truth }}</p>
    <p class="case-outcome">{{ debrief.prevented ? 'Your completed hold kept the money at the lodge.' : 'The case was not held and sealed before the deadline, so the money departed.' }}</p>
    <p class="muted small-copy">Keeping the money required the prevention steps below. A complete investigation also required a record of the plan and custody.</p>
    <details class="debrief-checks">
      <summary>Why this ending? Review your completed and missing steps</summary>
      <div class="check-groups"><section v-for="group in [{title:'Prevent the departure',items:debrief.prevention},{title:'Document the case',items:debrief.documentation}]" :key="group.title"><h3>{{ group.title }}</h3><ul><li v-for="check in group.items" :key="check.id" :class="{met:check.met}"><span class="check-state">{{ check.met?'Completed':'Missing' }}</span><strong>{{ check.label }}</strong><p>{{ check.explanation }}</p></li></ul></section></div>
    </details>
    <h3 class="moments-title">Where you were at the key moments</h3>
    <p class="muted small-copy">Being present does not automatically document the case. Evidence requires completing the corresponding action; the steps above show what you recorded.</p>
    <div class="debrief-moments"><article v-for="moment in debrief.moments" :key="moment.eventId" :class="{unseen:!moment.witnessed}"><p class="eyebrow">{{ worldTime(moment.at,start) }} · {{ moment.placeName }}</p><h4>{{ moment.title }}</h4><p>{{ moment.text }}</p><p class="moment-location">You: {{ moment.playerLocation }} · {{ moment.witnessed?'You were present':'You were elsewhere' }}</p></article></div>
  </section>
</template>

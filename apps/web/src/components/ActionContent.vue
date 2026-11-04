<script setup lang="ts">
import type { SuggestedAction } from '../../../../packages/engine/src/types.js';
import { actionLabel, gameDuration, realDuration, startCountdown, windowHint, waitSaving, worldTimePrecise } from '../lib/presentation';
defineProps<{ action: SuggestedAction; now: number; scale: number; start: string; busy?: boolean }>();
</script>

<template>
  <span class="action-copy">
    <span>{{ actionLabel(action,start,busy) }}</span>
    <small v-if="action.timing" class="action-window">{{ windowHint(action,now,scale,start) }}</small>
    <small v-if="action.wait?.reminder" class="action-window">{{ action.wait.reminder }}</small>
    <small v-if="action.wait" class="action-window">{{ busy ? `Advance the whole world to ${worldTimePrecise(action.wait.until,start)}.` : 'The whole world advances immediately.' }} Events and results stay in History.</small>
    <small v-if="action.wait?.warning" class="action-warning">{{ action.wait.warning }}</small>
  </span>
  <span class="action-cost">
    <template v-if="action.durationMs"><span>{{ realDuration(action.durationMs,scale) }} real</span><span>{{ gameDuration(action.durationMs) }} world</span></template>
    <span v-else-if="action.wait">{{ waitSaving(action,now,scale) }}</span>
    <span v-else>Now</span>
    <strong v-if="action.timing" class="action-countdown">{{ startCountdown(action,now,scale) }}</strong>
  </span>
</template>

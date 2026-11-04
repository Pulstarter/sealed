<script setup lang="ts">
import {computed,ref,watch} from 'vue';
const props=withDefaults(defineProps<{durationMs:number;remainingMs:number;ready:boolean;locale?:'en'|'es'}>(),{locale:'en'});
const seconds=computed(()=>Math.ceil(Math.max(0,props.remainingMs)/1000));
const fraction=computed(()=>props.ready?Math.min(1,Math.max(0,props.remainingMs/props.durationMs)):1);
const announcement=ref('');
const unit=computed(()=>props.locale==='es'?(seconds.value===1?'segundo':'segundos'):(seconds.value===1?'second':'seconds'));
const label=computed(()=>props.ready?(props.locale==='es'?`${seconds.value} ${unit.value} ${seconds.value===1?'restante':'restantes'}`:`${seconds.value} ${unit.value} remaining`):props.locale==='es'?'La decisión no ha empezado':'The decision has not started');
watch(seconds,(next,prior)=>{if(props.ready&&next!==prior&&[Math.ceil(props.durationMs/1000),6,3].includes(next))announcement.value=label.value;},{immediate:true});
</script>

<template>
  <div class="e-countdown-bar" :class="{'e-countdown-urgent':ready&&seconds<=3}" role="timer" :aria-label="label">
    <span class="e-countdown-track" aria-hidden="true"><span :style="{transform:'scaleX('+fraction+')'}"></span></span>
    <span class="e-countdown-value" aria-hidden="true"><strong>{{ready?seconds:'…'}}</strong><span>{{unit}}</span></span>
    <span class="e-sr-only" aria-live="polite">{{announcement}}</span>
  </div>
</template>

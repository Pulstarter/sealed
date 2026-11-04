<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref,watch} from 'vue';
const props=defineProps<{text:string;animated:boolean}>();
const shown=ref(0),words=computed(()=>{let at=0;return props.text.split(/(\s+)/u).map(word=>({word,at:(at+=word.length)-word.length}));});
let timer:ReturnType<typeof setInterval>|undefined,motion:MediaQueryList|undefined;
function complete(){clearInterval(timer);shown.value=props.text.length;}
function start(){clearInterval(timer);if(!props.text.length||!props.animated||motion?.matches){complete();return;}shown.value=0;const began=performance.now(),duration=Math.min(4000,props.text.length/55*1000);timer=setInterval(()=>{shown.value=Math.min(props.text.length,Math.floor((performance.now()-began)/duration*props.text.length));if(shown.value>=props.text.length)clearInterval(timer);},30);}
function motionChanged(){if(motion?.matches)complete();}
watch(()=>[props.text,props.animated],start);onMounted(()=>{motion=window.matchMedia('(prefers-reduced-motion: reduce)');motion.addEventListener('change',motionChanged);start();});onUnmounted(()=>{clearInterval(timer);motion?.removeEventListener('change',motionChanged);});
</script>

<template><p class="e-reveal-text" :aria-label="text" tabindex="0" @click="complete" @keydown.space.prevent="complete" @keydown.enter.prevent="complete"><span v-for="(part,i) in words" :key="i" aria-hidden="true" class="e-reveal-word"><span v-for="(letter,j) in part.word" :key="j" :class="{'e-unwritten':part.at+j>=shown}">{{letter}}</span></span></p></template>

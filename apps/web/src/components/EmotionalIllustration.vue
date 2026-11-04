<script setup lang="ts">
import {ref,watch} from 'vue';
const props=defineProps<{src:string;alt?:string;compact?:boolean;name?:string}>();
const status=ref<'loading'|'loaded'|'failed'>('loading');
watch(()=>props.src,()=>{status.value='loading';},{flush:'sync'});
function settled(event:Event,next:'loaded'|'failed'){if((event.target as HTMLImageElement).getAttribute('src')===props.src)status.value=next;}
</script>

<template>
  <span class="e-illustration" :class="{'e-illustration-compact':compact,'e-portrait':name,'e-art-loading':status==='loading'}" :aria-busy="status==='loading'">
    <img :key="src" :src="src" :alt="alt" :class="{'e-image-pending':status!=='loaded'}" @load="settled($event,'loaded')" @error="settled($event,'failed')"/>
    <span v-if="status!=='loaded'" class="e-art-status" role="status" :aria-label="(status==='loading'?'Loading illustration':'Illustration unavailable')+(name?' of '+name:'')">{{name?name.split(/\s+/).slice(0,2).map(p=>p[0]).join(''):compact?(status==='loading'?'…':'—'):status==='loading'?'Loading illustration…':'Illustration unavailable. You can keep reading.'}}</span>
  </span>
</template>

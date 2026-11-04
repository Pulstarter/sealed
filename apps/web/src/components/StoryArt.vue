<script setup lang="ts">
import { computed,onMounted,onUnmounted,ref } from 'vue';
const props=withDefaults(defineProps<{tile?:number}>(),{tile:0});
const descriptions=['Vagón cafetería iluminado en ámbar, de noche y bajo la lluvia.','Pasillo de servicio azul y equipajes.','Humo y chispas junto al equipaje del tren.','Andén de emergencia bajo la lluvia, con luces de rescate.'];
const frame=ref<HTMLElement>(),width=ref(900);let observer:ResizeObserver|undefined;
const style=computed(()=>({width:`${width.value}px`,height:`${width.value/1.5}px`,backgroundPosition:`${props.tile%2*100}% ${Math.floor(props.tile/2)*100}%`}));
onMounted(()=>{observer=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(r)width.value=Math.max(r.width,r.height*1.5);});if(frame.value)observer.observe(frame.value);});
onUnmounted(()=>observer?.disconnect());
</script>
<template><div ref="frame" class="v-art" role="img" :aria-label="descriptions[tile]"><div class="v-art-tile" :style="style"/></div></template>
<style scoped>
.v-art{position:relative;overflow:hidden;background:linear-gradient(135deg,#173044,#15191c);min-width:0;min-height:0}
.v-art-tile{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:url('/art/vagon-atlas.webp') no-repeat;background-size:205% 205%}
</style>

<script setup lang="ts">
import LegacyApp from './LegacyApp.vue';
import StoryApp from './components/StoryApp.vue';
import EmotionalApp from './components/EmotionalApp.vue';
const legacy=window.location.pathname.replace(/\/$/,'')==='/legacy';
const preview=window.location.pathname.replace(/\/$/,'')==='/preview';
const prepared=window.location.pathname.replace(/\/$/,'')==='/demo';
if(prepared){const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');if(manifest)manifest.href='/demo.webmanifest';}
if(legacy){document.documentElement.lang='en';document.title='SEALED — Nieve';}
</script>
<template><EmotionalApp v-if="preview||prepared" :prepared="prepared"/><LegacyApp v-else-if="legacy"/><StoryApp v-else/></template>

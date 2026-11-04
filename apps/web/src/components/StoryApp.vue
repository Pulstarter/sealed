<script setup lang="ts">
import { computed,nextTick,onMounted,onUnmounted,ref,watch } from 'vue';
import StoryArt from './StoryArt.vue';
import CountdownBar from './CountdownBar.vue';
import { useStory } from '../composables/useStory.js';
import '../story.css';
const story=useStory();
const {session,loading,working,pending,canRecover,error,notice,pages,pageIndex,remaining,connected}=story;
const help=ref<HTMLDialogElement>(),restart=ref<HTMLDialogElement>(),presenting=ref(false),debrief=ref(false),passage=ref<HTMLElement>();
const decision=computed(()=>session.value?.scene.decision);
const urgent=computed(()=>session.value?.phase==='deciding'||presenting.value);
const lastPage=computed(()=>pageIndex.value>=pages.value.length-1);
const labels={A:'Elegiste',B:'Elegiste',T:'El tiempo se agotó'};
watch(()=>session.value?.scene.id,()=>{presenting.value=false;debrief.value=false;});
watch(pageIndex,()=>{if(passage.value)passage.value.scrollTop=0;});
async function begin(){presenting.value=true;await nextTick();await story.act('begin');if(session.value?.phase!=='deciding'&&!pending.value)presenting.value=false;}
async function playAgain(){restart.value?.close();await story.start(true);}
function showHelp(){help.value?.showModal();}
const textState=()=>JSON.stringify({mode:session.value?.phase??'cover',scene:session.value?.scene.id,page:pageIndex.value+1,pages:pages.value.length,visibleText:urgent.value?decision.value?.prompt:pages.value[pageIndex.value],decision:urgent.value?{options:decision.value?.options,remainingSeconds:Math.ceil(remaining.value/1000)}:null,error:error.value||null});
onMounted(()=>{window.render_game_to_text=textState;});
onUnmounted(()=>{if(window.render_game_to_text===textState)delete window.render_game_to_text;});
</script>

<template>
  <div class="v-app">
    <header class="v-header">
      <span class="v-brand">SEALED</span>
      <span class="v-header-title">El último vagón</span>
      <button class="v-help" :disabled="urgent" @click="showHelp">Cómo jugar</button>
    </header>
    <div v-if="error" class="v-alert" role="alert"><span>{{error}}</span><button :disabled="working" @click="story.retry">{{canRecover?'Recuperar acción':'Reconectar'}}</button></div>
    <div v-else-if="pending&&!working" class="v-alert" role="status"><span>Hay una acción pendiente de confirmar.</span><button @click="story.retry">Recuperar acción</button></div>
    <div v-else-if="!connected" class="v-alert" role="status"><span>Conexión interrumpida. La lectura está guardada; una decisión abierta sigue corriendo.</span><button @click="story.refresh">Reconectar</button></div>
    <main v-if="loading" class="v-loading" aria-live="polite">Recuperando tu historia…</main>
    <main v-else-if="!session" class="v-cover">
      <div class="v-cover-image"><StoryArt :tile="0"/><div class="v-image-caption">Un tren nocturno. Una última oportunidad.</div></div>
      <section class="v-intro">
        <p class="v-kicker">Una historia que decides tú</p>
        <h1>El último<br/>vagón</h1>
        <p class="v-hook">Tu hermana ha desaparecido dentro del tren. Su último mensaje: «No confíes en Vidal».</p>
        <p class="v-objective">Encuentra a Inés y sal del tren con ella.</p>
        <p class="v-format">10–12 min de lectura · 3 decisiones urgentes</p>
        <p class="v-instructions">Lee a tu ritmo. Solo tendrás unos segundos para elegir en tres momentos clave. No responder también cambia la historia.</p>
        <button class="v-button v-primary" :disabled="working||!!pending" @click="story.start()">{{working?'Abriendo el tren…':'Comenzar la historia'}} <span aria-hidden="true">→</span></button>
        <p class="v-credit">Aventura de prueba en español · Guion preparado · Ilustraciones generadas con Meta.<br/>Contiene situaciones de peligro y posibles pérdidas.</p>
      </section>
    </main>
    <main v-else class="v-reader" :class="{'v-urgent':urgent}">
      <div class="v-scene-image"><StoryArt :tile="session.scene.art"/><div class="v-image-caption">{{session.phase==='finished'?'El desenlace':`Capítulo ${session.scene.chapter} de 10`}}</div></div>
      <section class="v-reading" :aria-busy="working">
        <div class="v-reading-meta"><span>{{session.phase==='finished'?'Tu final':`Capítulo ${session.scene.chapter} de 10`}}</span><span v-if="!urgent">Lectura sin prisa</span><span v-else>Una decisión cambia la historia</span></div>
        <template v-if="urgent&&decision">
          <div class="v-crisis" aria-labelledby="v-crisis-title">
            <CountdownBar :duration-ms="decision.durationMs" :remaining-ms="remaining" :ready="session.phase==='deciding'" locale="es"/>
            <h1 id="v-crisis-title">¿Qué haces?</h1>
            <p class="v-crisis-prompt">{{decision.prompt}}</p>
            <p class="v-time-hint">{{session.phase!=='deciding'?'Preparando la decisión…':remaining===0?'El plazo ha terminado. Recuperando la consecuencia…':'Elige antes de que termine el tiempo.'}}</p>
          </div>
          <div class="v-choices">
            <button v-for="option in decision.options" :key="option.id" class="v-choice" :disabled="working||!!pending||session.phase!=='deciding'||remaining<=0" @click="story.act('choose',option.id)"><span class="v-choice-letter" aria-hidden="true">{{option.id}}</span>{{option.label}}<span aria-hidden="true">→</span></button>
          </div>
        </template>
        <template v-else-if="debrief&&session.ending">
          <div class="v-passage v-debrief" ref="passage" tabindex="0">
            <p class="v-kicker">Así llegaste hasta aquí</p><h1>Tus decisiones</h1>
            <ol><li v-for="(explanation,index) in session.ending.explanation" :key="explanation"><span>{{labels[session.decisions[index]!.choice]}}</span><p>{{explanation}}</p></li></ol>
            <p class="v-end-note">Este final nace de las tres decisiones que tomaste, incluidos los silencios.</p>
          </div>
          <div class="v-page-actions"><button class="v-back" @click="debrief=false">← Volver al final</button><button class="v-button v-primary" @click="restart?.showModal()">Volver a jugar</button></div>
        </template>
        <template v-else>
          <div v-if="notice" class="v-notice" role="status"><span>{{notice}}</span><button aria-label="Cerrar aviso" @click="notice=''">×</button></div>
          <h1 class="v-scene-title">{{session.scene.title}}</h1>
          <div ref="passage" class="v-passage" tabindex="0" aria-label="Texto de la historia"><p v-for="(paragraph,index) in pages[pageIndex]" :key="`${session.scene.id}:${pageIndex}:${index}`">{{paragraph}}</p></div>
          <div class="v-page-count"><span>Encuentra a Inés. Sal con ella.</span><span>{{pageIndex+1}} / {{pages.length}}</span></div>
          <div class="v-page-actions">
            <button class="v-back" :disabled="pageIndex===0||working" aria-label="Página anterior" @click="story.previousPage">←</button>
            <button v-if="!lastPage" class="v-button v-primary" @click="story.nextPage">Seguir leyendo <span aria-hidden="true">→</span></button>
            <button v-else-if="decision" class="v-button v-primary" :disabled="working||!!pending" @click="begin">Decidir · {{decision.durationMs/1000}} s <span aria-hidden="true">→</span></button>
            <button v-else-if="session.ending" class="v-button v-primary" @click="debrief=true">Ver mis decisiones <span aria-hidden="true">→</span></button>
            <button v-else class="v-button v-primary" :disabled="working||!!pending" @click="story.act('continue')">{{working?'Continuando…':'Continuar la historia'}} <span aria-hidden="true">→</span></button>
          </div>
        </template>
      </section>
    </main>
    <dialog ref="help" class="v-dialog" aria-labelledby="v-help-title"><div class="v-dialog-head"><h2 id="v-help-title">Cómo jugar</h2><button class="v-help" @click="help?.close()">Cerrar</button></div><p>Tu objetivo es encontrar a Inés y salir del tren con ella. Lee cada página y pulsa «Seguir leyendo» para avanzar. La historia espera por ti.</p><p>En tres momentos verás «Decidir» y el tiempo disponible. Al pulsarlo aparecen dos opciones y empieza la cuenta atrás. Si no eliges, la historia continúa con la consecuencia de no actuar.</p><p>Una decisión abierta sigue corriendo si cierras o bloqueas la pantalla. Al volver, recuperarás lo que haya ocurrido. Recargar no te da más tiempo.</p><p>Al llegar al final podrás revisar cómo influyó cada decisión y volver a jugar.</p><p class="v-credit">Esta prueba usa un guion fijo y arte generado con Meta. No crea una historia nueva en cada partida. <a href="/legacy">Abrir la demo anterior</a>.</p><button class="v-button v-primary" @click="help?.close()">Entendido</button></dialog>
    <dialog ref="restart" class="v-dialog" aria-labelledby="v-restart-title"><h2 id="v-restart-title">¿Volver a empezar?</h2><p>Comenzarás la misma aventura desde el principio y podrás tomar otras decisiones.</p><div class="v-dialog-actions"><button class="v-help" @click="restart?.close()">Seguir aquí</button><button class="v-button v-primary" @click="playAgain">Empezar de nuevo</button></div></dialog>
  </div>
</template>

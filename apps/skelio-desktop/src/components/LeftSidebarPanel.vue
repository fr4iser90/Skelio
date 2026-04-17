<script setup lang="ts">
/**
 * Left column: same tab pattern as InspectorPanel (nav + scroll body).
 * Scene / Assets / VFX are placeholders until the data model supports them (see docs).
 */
import { ref } from "vue";
import CharacterStripPanel from "./CharacterStripPanel.vue";
import HierarchyPanel from "./HierarchyPanel.vue";

const leftTab = ref<"hierarchy" | "characters" | "scene" | "assets" | "vfx">("hierarchy");
</script>

<template>
  <div class="panel left-sidebar">
    <nav class="insp-tabs" role="tablist" aria-label="Linke Seitenleiste">
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': leftTab === 'hierarchy' }"
        :aria-selected="leftTab === 'hierarchy'"
        @click="leftTab = 'hierarchy'"
      >
        Hierarchie
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': leftTab === 'characters' }"
        :aria-selected="leftTab === 'characters'"
        @click="leftTab = 'characters'"
      >
        Charaktere
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': leftTab === 'scene' }"
        :aria-selected="leftTab === 'scene'"
        @click="leftTab = 'scene'"
      >
        Szene
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': leftTab === 'assets' }"
        :aria-selected="leftTab === 'assets'"
        @click="leftTab = 'assets'"
      >
        Assets
      </button>
      <button
        type="button"
        role="tab"
        class="insp-tab"
        :class="{ 'insp-tab--on': leftTab === 'vfx' }"
        :aria-selected="leftTab === 'vfx'"
        @click="leftTab = 'vfx'"
      >
        VFX
      </button>
    </nav>

    <div class="insp-body">
      <section v-show="leftTab === 'hierarchy'" class="insp-section left-tab-fill">
        <HierarchyPanel />
      </section>

      <section v-show="leftTab === 'characters'" class="insp-section left-tab-fill">
        <CharacterStripPanel variant="tab" />
      </section>

      <section v-show="leftTab === 'scene'" class="insp-section">
        <h3 class="panel-title">Szene und Hintergrund</h3>
        <p class="muted small">
          Hintergrundbilder und fertige Szenen-Vorlagen kommen mit einem späteren Datenmodell (Runtime-Export).
          Bis dahin: Referenzbild nur im Projekt / später im Character-Setup-Workflow — nicht in der Haupt-Toolbar.
        </p>
      </section>

      <section v-show="leftTab === 'assets'" class="insp-section">
        <h3 class="panel-title">Sprites und Assets</h3>
        <p class="muted small">
          Zentrale Bibliothek für Sprite-Sheets, Effekt-Texturen und geteilte Assets — geplant für Animationen
          und spätere Effekt-Spuren.
        </p>
      </section>

      <section v-show="leftTab === 'vfx'" class="insp-section">
        <h3 class="panel-title">VFX</h3>
        <p class="muted small">
          Partikel, Trails und andere Effekte pro Clip oder Knochen — noch nicht angebunden. Hier landet die
          spätere VFX-Steuerung.
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.left-sidebar.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  padding: 0.55rem 0.65rem 0.65rem;
}
.insp-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  flex-shrink: 0;
  margin-bottom: 0.45rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid #2d3340;
}
.insp-tab {
  padding: 0.32rem 0.5rem;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  border: 1px solid #3b3f48;
  border-radius: 6px;
  background: #1a1c22;
  color: #94a3b8;
  cursor: pointer;
}
.insp-tab:hover {
  color: #cbd5e1;
  border-color: #525a6b;
}
.insp-tab--on {
  border-color: #6366f1;
  color: #e0e7ff;
  background: linear-gradient(180deg, #312e52 0%, #252043 100%);
}
.insp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.15rem;
  display: flex;
  flex-direction: column;
}
.left-tab-fill {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 0.35rem;
}
.left-tab-fill :deep(.panel) {
  flex: 1;
  min-height: 0;
}
.insp-section {
  padding-bottom: 0.35rem;
}
.panel-title {
  margin: 0 0 0.4rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid #2d3340;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: #94a3b8;
}
.muted {
  color: #7c8494;
}
.small {
  font-size: 0.72rem;
  line-height: 1.45;
  margin: 0;
}
</style>

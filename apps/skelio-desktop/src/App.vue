<script setup lang="ts">
import { RUNTIME_SCHEMA_VERSION } from "@skelio/domain";
</script>

<template>
  <main class="wrap">
    <h1>Skelio</h1>
    <p class="lead">Desktop-Shell (Vue + Tauri). Runtime-Schema: {{ RUNTIME_SCHEMA_VERSION }}</p>
    <p class="meta">Planung und Architektur: <code>docs/README.md</code></p>
  </main>
</template>

<style scoped>
.wrap {
  padding: 2rem;
  font-family: system-ui, sans-serif;
}
.lead {
  margin: 0.5rem 0 1rem;
}
.meta {
  color: #666;
  font-size: 0.95rem;
}
code {
  background: #eee;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
</style>

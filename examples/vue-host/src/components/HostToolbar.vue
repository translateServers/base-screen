<script setup lang="ts">
/**
 * 宿主外壳的顶栏。它是纯展示组件：只把用户意图 emit 出去，不直接接触设计器，
 * 这样设计器的公共 API 调用集中在 App.vue 一处，边界清晰。
 */
defineProps<{
  status: string;
  busy: boolean;
}>();

defineEmits<{
  restock: [];
  undo: [];
}>();
</script>

<template>
  <header class="host-toolbar">
    <strong class="host-title">Base Screen · Vue 宿主</strong>
    <button id="host-restock" type="button" :disabled="busy" @click="$emit('restock')">
      补货 +10
    </button>
    <button id="host-undo" type="button" :disabled="busy" @click="$emit('undo')">撤销</button>
    <output id="host-status" class="host-status">{{ status }}</output>
  </header>
</template>

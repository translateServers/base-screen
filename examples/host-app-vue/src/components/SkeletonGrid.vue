<script setup lang="ts">
/** 骨架屏占位：尺寸固定，避免加载态与就绪态之间的布局跳动。 */
withDefaults(defineProps<{ count?: number }>(), { count: 3 });
</script>

<template>
  <div class="screen-grid">
    <article
      v-for="index in count"
      :key="index"
      class="screen-card screen-card--skeleton"
      aria-hidden="true"
    />
  </div>
</template>

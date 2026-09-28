<script setup lang="ts">
/**
 * 宿主自有的 Vue 物料组件：普通 SFC，`@base-screen/vue` 桥接把设计器写入的
 * model 映射成 props，组件本身不需要知道 Base Screen 的存在。
 *
 * 渲染盒由引擎在赋 model 前写死（宽高 = canonical component.size），
 * 因此这里只写内部排版，不写 width/height。
 */
defineProps<{
  label: string;
  unit: string;
  value: number | null;
}>();
</script>

<template>
  <div class="kpi-card" data-kpi-card>
    <div class="kpi-card__label">{{ label }}</div>
    <div class="kpi-card__value" data-kpi-card-value>
      {{ value === null ? '--' : `${value}${unit}` }}
    </div>
  </div>
</template>

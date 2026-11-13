<script setup lang="ts">
/**
 * 宿主自有的 Vue 物料组件：普通 SFC，`base-screen/vue` 桥接把设计器写入的
 * model 映射成 props，组件本身不需要知道 Base Screen 的存在。
 *
 * 原子物料：只呈现「数值 + 单位」。描述这块卡是什么的标题交给文档层的 `base.text`，
 * 底座与边框交给 `base.container` 或边框物料，都不内建在读数组件里。
 *
 * 渲染盒由引擎在赋 model 前写死（宽高 = canonical component.size），
 * 因此这里只写内部排版，不写 width/height。
 */
defineProps<{
  unit: string;
  value: number | null;
}>();
</script>

<template>
  <div class="metric-value" data-metric-value>
    <div class="metric-value__number" data-metric-value-number>
      {{ value === null ? '--' : `${value}${unit}` }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * 宿主自有的 Vue 物料组件。它是普通 Vue SFC——`@base-screen/vue` 的桥接负责把
 * 设计器写入的 model 映射成 props，组件本身不需要知道 Base Screen 的存在。
 */
const props = defineProps<{
  title: string;
  stock: number;
}>();

const lowStock = computed(() => props.stock < 10);
</script>

<template>
  <article class="product-card" data-product-card>
    <span class="product-card-title">{{ props.title }}</span>
    <span
      class="product-card-stock"
      data-product-card-stock
      :data-low-stock="String(lowStock)"
    >
      库存 {{ props.stock }}
    </span>
  </article>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

/** 应用外壳：顶栏（品牌 + 返回列表）+ 主区域。高度链由 CSS 保证。 */
const router = useRouter();
</script>

<template>
  <div class="shell">
    <header class="shell__header">
      <a
        class="shell__brand"
        href="#/"
        @click.prevent="router.push('/')"
      >
        大屏管家 · Vue
      </a>
      <button type="button" class="button" @click="router.push('/')">返回列表</button>
    </header>
    <main class="shell__content">
      <div class="shell__main">
        <slot />
      </div>
    </main>
  </div>
</template>

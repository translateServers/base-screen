<script setup lang="ts">
import { useRoute } from 'vue-router';

/** 应用外壳：顶栏（品牌 + 主导航 + 运行环境标记）+ 主区域。高度链由 CSS 保证。
 *  导航只有两项（大屏 / 数据源）；`aria-current="page"` 让读屏与冒烟都能判断当前页。 */
const route = useRoute();
</script>

<template>
  <div class="shell">
    <header class="shell__header">
      <a class="shell__brand" href="#/">
        BASE SCREEN <span class="shell__brand-mark">/</span> 数据可视化
      </a>
      <nav class="shell__nav" aria-label="主导航">
        <RouterLink
          class="shell__tab"
          :class="{ 'shell__tab--active': !route.path.startsWith('/datasources') }"
          to="/"
          :aria-current="route.path.startsWith('/datasources') ? undefined : 'page'"
        >
          大屏
        </RouterLink>
        <RouterLink
          class="shell__tab"
          :class="{ 'shell__tab--active': route.path.startsWith('/datasources') }"
          to="/datasources"
          :aria-current="route.path.startsWith('/datasources') ? 'page' : undefined"
        >
          数据源
        </RouterLink>
      </nav>
      <span class="shell__meta">VUE 3 · ENGINE EMBEDDED</span>
    </header>
    <main class="shell__content">
      <div class="shell__main">
        <slot />
      </div>
    </main>
  </div>
</template>

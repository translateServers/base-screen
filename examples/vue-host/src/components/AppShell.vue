<script setup lang="ts">
/** 应用外壳：顶栏（品牌 + 运行环境标记）+ 主区域。高度链由 CSS 保证。
 *  列表页已经是根路由，「返回列表」在这里没有去处，因此不放按钮。 */
</script>

<template>
  <div class="shell">
    <header class="shell__header">
      <a class="shell__brand" href="#/">
        BASE SCREEN <span class="shell__brand-mark">/</span> 数据可视化
      </a>
      <span class="shell__meta">VUE 3 · ENGINE EMBEDDED</span>
    </header>
    <main class="shell__content">
      <div class="shell__main">
        <slot />
      </div>
    </main>
  </div>
</template>

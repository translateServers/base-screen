<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppShell from './components/AppShell.vue';

// 宿主外壳只包宿主自有页面。嵌入基座的页面占满视口，基座自带顶栏与返回入口，
// 再叠一层宿主布局会抢尺寸链（百分比高度退化成内容高度）也会重复返回按钮。
const route = useRoute();
</script>

<template>
  <!--
    按 path 给页面实例打 key：同一路由记录换 `:screenId` 时不复用组件，
    每个 URL 路径对应一次挂载 + 一次装配。基座页面因此可以在 onMounted 里一条直路走完，
    不需要监听参数、也不需要「先释放再重建」的中间态。查询串不参与 key（`?line=` 等只影响
    文档内的变量，不该重建页面）。
  -->
  <AppShell v-if="route.meta.hostShell">
    <RouterView :key="route.path" />
  </AppShell>
  <RouterView v-else :key="route.path" />
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppShell from './components/AppShell.vue';

// 宿主外壳只包宿主自有页面。嵌入基座的页面占满视口，基座自带顶栏与返回入口，
// 再叠一层宿主布局会抢尺寸链（百分比高度退化成内容高度）也会重复返回按钮。
const route = useRoute();
</script>

<template>
  <AppShell v-if="route.meta.hostShell">
    <RouterView />
  </AppShell>
  <RouterView v-else />
</template>

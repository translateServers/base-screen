<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useScreensStore } from '../composables/use-stores';
import { formatDateTime, formatNumber } from '../lib/format';
import { showToast } from '../lib/toast';
import { screensStore } from '../store/screens-store';
import ErrorBanner from './ErrorBanner.vue';
import SkeletonGrid from './SkeletonGrid.vue';

const router = useRouter();
// store 是真源；composable 提供响应式快照。
const state = useScreensStore();

async function createScreen(): Promise<void> {
  const name = window.prompt('新大屏名称', '未命名大屏');
  if (name === null) return;
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    showToast('名称不能为空', 'error');
    return;
  }
  const id = await screensStore.getState().create(trimmed);
  if (id === null) {
    showToast(`新建失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  showToast(`已创建「${trimmed}」`, 'success');
  await router.push(`/screens/${id}/edit`);
}

async function removeScreen(id: string, name: string): Promise<void> {
  if (!window.confirm(`确认删除「${name}」？该操作不可撤销。`)) return;
  const removed = await screensStore.getState().remove(id);
  if (!removed) {
    showToast(`删除失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  showToast(`已删除「${name}」`, 'success');
}

onMounted(() => {
  void screensStore.getState().load();
});
</script>

<template>
  <div class="page">
    <header class="list-header">
      <h1>大屏管家</h1>
      <button type="button" class="button button--primary" @click="createScreen">新建大屏</button>
    </header>

    <ErrorBanner
      v-if="state.status === 'error'"
      :message="state.error ?? '加载失败'"
      @retry="screensStore.getState().load()"
    />
    <SkeletonGrid v-else-if="state.status !== 'ready'" />
    <p v-else-if="state.screens.length === 0" class="empty-state">
      还没有大屏，点击右上角「新建大屏」开始。
    </p>
    <div v-else class="screen-grid">
      <article v-for="screen in state.screens" :key="screen.id" class="screen-card">
        <h2 class="screen-card__name">{{ screen.name }}</h2>
        <dl class="screen-card__meta">
          <div>
            <dt>版本</dt>
            <dd>{{ formatNumber(screen.revision) }}</dd>
          </div>
          <div>
            <dt>更新于</dt>
            <dd>{{ formatDateTime(screen.updatedAt) }}</dd>
          </div>
        </dl>
        <footer class="screen-card__actions">
          <button type="button" class="button" @click="router.push(`/screens/${screen.id}/edit`)">
            编辑
          </button>
          <button type="button" class="button" @click="router.push(`/screens/${screen.id}/view`)">
            查看
          </button>
          <button
            type="button"
            class="button button--danger"
            @click="removeScreen(screen.id, screen.name)"
          >
            删除
          </button>
        </footer>
      </article>
    </div>
  </div>
</template>

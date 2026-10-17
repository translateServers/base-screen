<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
const newName = ref('');
const pendingDeleteId = ref<string | null>(null);

async function createScreen(): Promise<void> {
  const trimmed = newName.value.trim();
  if (trimmed.length === 0) {
    showToast('请先填写大屏名称', 'error');
    return;
  }
  const id = await screensStore.getState().create(trimmed);
  if (id === null) {
    showToast(`新建失败：${screensStore.getState().error ?? '未知错误'}`, 'error');
    return;
  }
  newName.value = '';
  showToast(`已创建「${trimmed}」`, 'success');
  await router.push(`/screens/${id}/edit`);
}

async function removeScreen(id: string, name: string): Promise<void> {
  pendingDeleteId.value = null;
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
      <!-- 新建与删除都走页面内控件：window.prompt / window.confirm 在嵌入式浏览器里会被
           直接抑制并返回 null，那样点按钮就只剩「没有反应」。 -->
      <form class="create-screen" @submit.prevent="createScreen">
        <input
          v-model="newName"
          class="field"
          type="text"
          placeholder="新大屏名称"
          aria-label="新大屏名称"
        />
        <button type="submit" class="button button--primary">新建大屏</button>
      </form>
    </header>

    <ErrorBanner
      v-if="state.status === 'error'"
      :message="state.error ?? '加载失败'"
      @retry="screensStore.getState().load()"
    />
    <SkeletonGrid v-else-if="state.status !== 'ready'" />
    <p v-else-if="state.screens.length === 0" class="empty-state">
      还没有大屏，输入名称后点「新建大屏」开始。
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
          <template v-if="pendingDeleteId === screen.id">
            <span class="screen-card__confirm">删除后不可撤销</span>
            <button type="button" class="button button--danger" @click="removeScreen(screen.id, screen.name)">
              确认删除
            </button>
            <button type="button" class="button" @click="pendingDeleteId = null">取消</button>
          </template>
          <button
            v-else
            type="button"
            class="button button--danger"
            @click="pendingDeleteId = screen.id"
          >
            删除
          </button>
        </footer>
      </article>
    </div>
  </div>
</template>

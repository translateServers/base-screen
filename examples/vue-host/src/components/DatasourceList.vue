<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../lib/api';
import {
  catalogHint,
  DATASOURCE_TEXT,
  DATASOURCE_TYPE_OPTIONS,
  type DatasourceItem,
  type DatasourceRefScreen,
  type DatasourceType,
  displayDatasetId,
  isWritableType,
  statusLabel,
  statusTone,
  testResultLabel,
  typeLabel,
} from '../lib/datasource-model';
import { formatDateTime } from '../lib/format';
import { showToast } from '../lib/toast';
import DatasourceDialogs from './DatasourceDialogs.vue';
import DatasourceDrawer from './DatasourceDrawer.vue';
import ErrorBanner from './ErrorBanner.vue';
import SkeletonGrid from './SkeletonGrid.vue';

/**
 * 数据源管理页（PRD §10.2 / A25–A27、A33）。
 *
 * 与 React / Vanilla 同构：同一组 data 属性、同一份模型文案、同样"看 body.ok 判业务成败"。
 * 删除保护的引用清单来自 409 响应（权威），不用列表里的 refCount 猜。
 */
const status = ref<'loading' | 'ready' | 'error'>('loading');
const items = ref<readonly DatasourceItem[]>([]);
const total = ref(0);
const visibleCount = ref(0);
const error = ref<string | null>(null);
const type = ref<DatasourceType | 'all'>('all');
const query = ref('');
const result = ref<{
  readonly datasetId: string;
  readonly ok: boolean;
  readonly message: string;
} | null>(null);
const drawer = ref<
  | { readonly mode: 'closed' }
  | { readonly mode: 'create' }
  | { readonly mode: 'edit'; readonly datasetId: string; readonly autoPreview: boolean }
>({ mode: 'closed' });
const dialog = ref<
  | { readonly kind: 'none' }
  | { readonly kind: 'confirm-delete'; readonly item: DatasourceItem }
  | {
      readonly kind: 'blocked';
      readonly name: string;
      readonly refScreens: readonly DatasourceRefScreen[];
    }
>({ kind: 'none' });

const hint = computed((): string | null => catalogHint(total.value, visibleCount.value));

async function load(): Promise<void> {
  if (status.value !== 'ready') status.value = 'loading';
  const response = await api.listDatasources({ type: type.value, query: query.value, limit: 100 });
  if (response.ok === false) {
    status.value = 'error';
    error.value = response.error.message;
    return;
  }
  items.value = response.data.items;
  total.value = response.data.total;
  visibleCount.value = response.data.catalogVisibleCount;
  status.value = 'ready';
  error.value = null;
}

async function testStored(item: DatasourceItem): Promise<void> {
  const response = await api.testDatasourceStored(item.datasetId);
  if (response.ok === false) {
    result.value = { datasetId: item.datasetId, ok: false, message: response.error.message };
    showToast(`${DATASOURCE_TEXT.testFailed}：${response.error.message}`, 'error');
    return;
  }
  result.value = {
    datasetId: item.datasetId,
    ok: response.data.ok,
    message: response.data.message,
  };
  showToast(
    testResultLabel(response.data.ok, response.data.message, response.data.rowCount),
    response.data.ok ? 'success' : 'error',
  );
  // 测试会落库存状态（ready/error），刷新一次让徽标跟上
  await load();
}

function readRefScreens(
  value: Readonly<Record<string, unknown>> | undefined,
): readonly DatasourceRefScreen[] {
  const raw = value?.refScreens;
  if (Array.isArray(raw) === false) return [];
  const screens: DatasourceRefScreen[] = [];
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    screens.push({
      id: record.id,
      name: record.name,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
    });
  }
  return screens;
}

async function askDelete(item: DatasourceItem): Promise<void> {
  if (item.refCount === 0) {
    dialog.value = { kind: 'confirm-delete', item };
    return;
  }
  const response = await api.deleteDatasource(item.datasetId);
  if (response.ok === false) {
    if (response.error.code === 'DATASOURCE_IN_USE') {
      dialog.value = {
        kind: 'blocked',
        name: item.name,
        refScreens: readRefScreens(response.error.payload),
      };
      return;
    }
    showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
    return;
  }
  showToast(`已删除「${item.name}」`, 'success');
  await load();
}

async function confirmDelete(): Promise<void> {
  if (dialog.value.kind !== 'confirm-delete') return;
  const item = dialog.value.item;
  dialog.value = { kind: 'none' };
  const response = await api.deleteDatasource(item.datasetId);
  if (response.ok === false) {
    if (response.error.code === 'DATASOURCE_IN_USE') {
      dialog.value = {
        kind: 'blocked',
        name: item.name,
        refScreens: readRefScreens(response.error.payload),
      };
      return;
    }
    showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
    return;
  }
  showToast(`已删除「${item.name}」`, 'success');
  await load();
}

function clearFilters(): void {
  query.value = '';
  type.value = 'all';
}

onMounted(async () => {
  await load();
});

watch([type, query], async () => {
  await load();
});
</script>

<template>
  <div class="page ds-page">
    <header class="list-header">
      <div class="list-header__title">
        <h1>{{ DATASOURCE_TEXT.pageTitle }}</h1>
        <p class="list-header__subtitle">{{ DATASOURCE_TEXT.pageDescription }}</p>
      </div>
      <div class="ds-toolbar">
        <input
          v-model="query"
          class="field ds-toolbar__search"
          type="search"
          data-ds-search=""
          aria-label="搜索数据源"
          :placeholder="DATASOURCE_TEXT.searchPlaceholder"
        />
        <div class="ds-toolbar__filters" role="group" aria-label="按类型筛选">
          <button
            v-for="option in DATASOURCE_TYPE_OPTIONS"
            :key="option.value"
            type="button"
            class="button ds-filter"
            :class="{ 'ds-filter--active': type === option.value }"
            :data-ds-filter="option.value"
            :aria-pressed="type === option.value"
            @click="type = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <button type="button" class="button" @click="load">{{ DATASOURCE_TEXT.refresh }}</button>
        <button
          type="button"
          class="button button--primary"
          data-ds-create=""
          @click="drawer = { mode: 'create' }"
        >
          {{ DATASOURCE_TEXT.createButton }}
        </button>
      </div>
    </header>

    <div class="ds-meta">
      <span data-ds-total="">共 {{ total }} 条</span>
      <span v-if="hint !== null" class="ds-meta__hint" data-ds-catalog-hint="">{{ hint }}</span>
    </div>

    <p
      v-if="result !== null"
      class="ds-result"
      :class="result.ok ? 'ds-result--ok' : 'ds-result--error'"
      :data-ds-result="result.ok ? 'ok' : 'error'"
      role="status"
    >
      {{ testResultLabel(result.ok, result.message, undefined) }}
    </p>

    <ErrorBanner
      v-if="status === 'error'"
      :message="error ?? DATASOURCE_TEXT.loadFailed"
      @retry="load"
    />
    <SkeletonGrid v-else-if="status === 'loading'" :count="3" />
    <p v-else-if="items.length === 0" class="empty-state" data-ds-empty="">
      <template v-if="query.trim() === '' && type === 'all'">{{ DATASOURCE_TEXT.emptyList }}</template>
      <template v-else>
        {{ DATASOURCE_TEXT.emptyFiltered }}。{{ DATASOURCE_TEXT.emptyFilteredHint }}
        <button type="button" class="button ds-empty__reset" @click="clearFilters">
          {{ DATASOURCE_TEXT.clearFilters }}
        </button>
      </template>
    </p>
    <div v-else class="ds-table-wrap">
      <table class="ds-table">
        <thead>
          <tr>
            <th scope="col">名称</th>
            <th scope="col">类型</th>
            <th scope="col">状态</th>
            <th scope="col">连接摘要</th>
            <th scope="col">引用</th>
            <th scope="col">更新时间</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in items"
            :key="item.datasetId"
            data-ds-row=""
            :data-type="item.type"
            :data-status="item.status"
            :data-dataset-id="item.datasetId"
          >
            <td>
              <span class="ds-name">{{ item.name }}</span>
              <code class="ds-id" :title="item.datasetId">{{ displayDatasetId(item.datasetId, 32) }}</code>
              <span v-if="item.description !== null" class="ds-desc">{{ item.description }}</span>
            </td>
            <td>{{ typeLabel(item.type) }}</td>
            <td>
              <span class="ds-badge" :class="`ds-badge--${statusTone(item.status)}`" :title="item.lastTest?.message ?? ''">
                {{ statusLabel(item.status) }}
              </span>
            </td>
            <td class="ds-summary">{{ item.configSummary }}</td>
            <td>{{ item.refCount }}</td>
            <td>{{ formatDateTime(item.updatedAt) }}</td>
            <td class="ds-actions">
              <template v-if="isWritableType(item.type)">
                <button
                  type="button"
                  class="button ds-action"
                  data-ds-action="edit"
                  @click="drawer = { mode: 'edit', datasetId: item.datasetId, autoPreview: false }"
                >
                  {{ DATASOURCE_TEXT.edit }}
                </button>
                <button type="button" class="button ds-action" data-ds-action="test" @click="testStored(item)">
                  {{ DATASOURCE_TEXT.test }}
                </button>
                <button
                  type="button"
                  class="button ds-action"
                  data-ds-action="preview"
                  @click="drawer = { mode: 'edit', datasetId: item.datasetId, autoPreview: true }"
                >
                  {{ DATASOURCE_TEXT.preview }}
                </button>
                <button
                  type="button"
                  class="button button--danger ds-action"
                  data-ds-action="delete"
                  @click="askDelete(item)"
                >
                  {{ DATASOURCE_TEXT.remove }}
                </button>
              </template>
              <button
                v-else
                type="button"
                class="button ds-action"
                data-ds-action="view"
                @click="drawer = { mode: 'edit', datasetId: item.datasetId, autoPreview: false }"
              >
                {{ DATASOURCE_TEXT.view }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <DatasourceDrawer
      v-if="drawer.mode !== 'closed'"
      :key="drawer.mode === 'edit' ? drawer.datasetId : 'create'"
      :dataset-id="drawer.mode === 'edit' ? drawer.datasetId : undefined"
      :auto-preview="drawer.mode === 'edit' ? drawer.autoPreview : false"
      @close="drawer = { mode: 'closed' }"
      @saved="
        async () => {
          drawer = { mode: 'closed' };
          await load();
        }
      "
    />

    <DatasourceDialogs
      :kind="dialog.kind === 'confirm-delete' ? 'confirm-delete' : dialog.kind === 'blocked' ? 'delete-blocked' : 'none'"
      :name="dialog.kind === 'confirm-delete' ? dialog.item.name : dialog.kind === 'blocked' ? dialog.name : ''"
      :ref-screens="dialog.kind === 'blocked' ? dialog.refScreens : []"
      @cancel="dialog = { kind: 'none' }"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../lib/api';
import { resolveApiBase } from '../lib/api-base';
import {
  ASSET_ACCEPTED_TYPES,
  ASSET_TEXT,
  assetContentPath,
  assetScopeLabel,
  formatAssetBytes,
  readAssetRefScreens,
  validateAssetFile,
} from '../lib/asset-model';
import { formatDateTime } from '../lib/format';
import { showToast } from '../lib/toast';
import { clearAssetReturn, readAssetReturn } from '../screen/asset-return';
import type { HostAssetShape } from '../types';
import ErrorBanner from './ErrorBanner.vue';
import SkeletonGrid from './SkeletonGrid.vue';

/**
 * 宿主素材后台页：公共素材的长期管理入口。
 *
 * 设计器左栏只做消费 + 临时上传；这里的上传只产生公共素材。临时素材按来源筛选查看，
 * 可删除未引用项，删除保护与列表引用数由后端计算。
 */
type AssetScope = 'public' | 'temporary';

const SCOPES: readonly { readonly value: AssetScope; readonly label: string }[] = [
  { value: 'public', label: ASSET_TEXT.scopePublic },
  { value: 'temporary', label: ASSET_TEXT.scopeTemporary },
];

const scope = ref<AssetScope>('public');
const query = ref('');
const items = ref<readonly HostAssetShape[]>([]);
const status = ref<'loading' | 'ready' | 'error'>('loading');
const error = ref<string | null>(null);
const result = ref<{ readonly ok: boolean; readonly message: string } | null>(null);
const pendingDeleteId = ref<string | null>(null);
const uploading = ref(false);
const returnTarget = readAssetReturn();

const visibleItems = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase();
  return normalized.length === 0
    ? items.value
    : items.value.filter((asset) => asset.name.toLocaleLowerCase().includes(normalized));
});

async function load(): Promise<void> {
  if (status.value !== 'ready') status.value = 'loading';
  const response = await api.listAssets(scope.value === 'temporary' ? { scope: 'temporary' } : {});
  if (response.ok === false) {
    status.value = 'error';
    error.value = response.error.message;
    return;
  }
  items.value = response.data.assets;
  status.value = 'ready';
  error.value = null;
}

async function uploadFiles(files: readonly File[]): Promise<void> {
  if (files.length === 0 || uploading.value || scope.value !== 'public') return;
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of files) {
    const reason = validateAssetFile(file);
    if (reason === null) accepted.push(file);
    else rejected.push(`${file.name}：${reason}`);
  }
  if (accepted.length === 0) {
    result.value = { ok: false, message: rejected.join('；') };
    return;
  }
  uploading.value = true;
  let uploaded = 0;
  for (const file of accepted) {
    const response = await api.uploadAsset(file);
    if (response.ok) uploaded += 1;
    else rejected.push(`${file.name}：${response.error.message}`);
  }
  uploading.value = false;
  await load();
  result.value = {
    ok: rejected.length === 0,
    message: `已上传 ${uploaded}/${accepted.length} 张公共素材。${
      rejected.length === 0 ? '' : ` ${rejected.join('；')}`
    }`,
  };
  if (uploaded > 0) showToast(`已上传 ${uploaded} 张公共素材`, 'success');
}

function onUploadChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  void uploadFiles(files);
}

function askDelete(asset: HostAssetShape): void {
  pendingDeleteId.value = asset.id;
  result.value = null;
}

async function removeAsset(asset: HostAssetShape): Promise<void> {
  pendingDeleteId.value = null;
  const response = await api.deleteAsset(asset.id);
  if (response.ok === false) {
    if (response.error.code === 'ASSET_IN_USE') {
      const screens = readAssetRefScreens(response.error.payload);
      result.value = {
        ok: false,
        message:
          screens.length > 0
            ? `该素材仍被这些大屏引用：${screens.join('、')}。先替换引用后再删除。`
            : response.error.message,
      };
    } else {
      result.value = { ok: false, message: `删除失败：${response.error.message}` };
    }
    return;
  }
  result.value = { ok: true, message: `已删除「${asset.name}」。` };
  await load();
  showToast(`已删除「${asset.name}」`, 'success');
}

watch(scope, () => {
  pendingDeleteId.value = null;
  result.value = null;
  status.value = 'loading';
  void load();
});

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="page ds-page asset-admin-page">
    <header class="list-header">
      <div class="list-header__title">
        <h1>{{ ASSET_TEXT.adminTitle }}</h1>
        <p class="list-header__subtitle">{{ ASSET_TEXT.adminDescription }}</p>
      </div>
      <div class="ds-toolbar">
        <a
          v-if="returnTarget"
          class="button ds-return-link"
          :href="returnTarget.href"
          data-asset-admin-return
          @click="clearAssetReturn"
        >
          返回大屏
        </a>
        <input
          v-model="query"
          class="field ds-toolbar__search"
          type="search"
          data-asset-admin-search
          aria-label="搜索素材"
          :placeholder="ASSET_TEXT.searchPlaceholder"
        />
        <div class="ds-toolbar__filters" role="group" aria-label="按来源筛选">
          <button
            v-for="option in SCOPES"
            :key="option.value"
            type="button"
            class="button ds-filter"
            :class="{ 'ds-filter--active': scope === option.value }"
            :data-asset-admin-scope="option.value"
            :aria-pressed="scope === option.value"
            @click="scope = option.value"
          >
            {{ option.label }}
          </button>
        </div>
        <button type="button" class="button" @click="load">{{ ASSET_TEXT.refresh }}</button>
        <label
          v-if="scope === 'public'"
          class="button button--primary asset-admin-upload"
          data-asset-admin-upload-label
        >
          {{ ASSET_TEXT.publicUpload }}
          <input
            class="asset-admin-upload-input"
            type="file"
            :accept="ASSET_ACCEPTED_TYPES"
            multiple
            hidden
            data-asset-admin-upload
            @change="onUploadChange"
          />
        </label>
      </div>
    </header>

    <div class="ds-meta">
      <span data-asset-admin-total>共 {{ visibleItems.length }} 条</span>
    </div>

    <p
      v-if="result"
      class="ds-result"
      :class="`ds-result--${result.ok ? 'ok' : 'error'}`"
      :data-asset-admin-result="result.ok ? 'ok' : 'error'"
      role="status"
    >
      {{ result.message }}
    </p>

    <ErrorBanner
      v-if="status === 'error'"
      :message="error ?? ASSET_TEXT.loadFailed"
      @retry="load"
    />
    <SkeletonGrid v-else-if="status === 'loading'" :count="3" />
    <p v-else-if="visibleItems.length === 0" class="empty-state" data-asset-admin-empty>
      {{
        items.length === 0
          ? scope === 'public'
            ? ASSET_TEXT.emptyPublic
            : ASSET_TEXT.emptyTemporary
          : ASSET_TEXT.emptyFiltered
      }}
    </p>
    <div v-else class="ds-table-wrap">
      <table class="ds-table asset-admin-table">
        <thead>
          <tr>
            <th scope="col">{{ ASSET_TEXT.columnAsset }}</th>
            <th scope="col">{{ ASSET_TEXT.columnSource }}</th>
            <th scope="col">{{ ASSET_TEXT.columnType }}</th>
            <th scope="col">{{ ASSET_TEXT.columnSize }}</th>
            <th scope="col">{{ ASSET_TEXT.inUse }}</th>
            <th scope="col">{{ ASSET_TEXT.columnUploadedAt }}</th>
            <th scope="col">{{ ASSET_TEXT.columnExpiresAt }}</th>
            <th scope="col">{{ ASSET_TEXT.columnActions }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="asset in visibleItems"
            :key="asset.id"
            data-asset-admin-row
            :data-asset-id="asset.id"
            :data-asset-scope="asset.temporary ? 'temporary' : 'public'"
          >
            <td>
              <span class="asset-admin-name">
                <img
                  class="asset-admin-thumb"
                  :src="`${resolveApiBase()}${assetContentPath(asset)}`"
                  alt=""
                />
                <span class="asset-admin-name-text">{{ asset.name }}</span>
              </span>
            </td>
            <td>
              <span class="asset-admin-source">
                <span
                  class="ds-badge"
                  :class="asset.temporary ? 'ds-badge--draft' : 'ds-badge--builtin'"
                >
                  {{ assetScopeLabel(asset) }}
                </span>
                <small
                  v-if="asset.temporary && asset.screenId !== null"
                  class="asset-admin-scope-detail"
                >
                  {{ ASSET_TEXT.screenPrefix }} {{ asset.screenId }}
                </small>
              </span>
            </td>
            <td>{{ asset.mimeType }}</td>
            <td>{{ formatAssetBytes(asset.byteSize) }}</td>
            <td>{{ asset.referenceCount }}</td>
            <td>{{ formatDateTime(asset.createdAt) }}</td>
            <td>{{ asset.expiresAt === null ? '—' : formatDateTime(asset.expiresAt) }}</td>
            <td class="ds-actions">
              <template v-if="pendingDeleteId === asset.id">
                <button
                  type="button"
                  class="button button--danger ds-action"
                  data-asset-admin-confirm
                  @click="removeAsset(asset)"
                >
                  {{ ASSET_TEXT.confirmRemove }}
                </button>
                <button
                  type="button"
                  class="button ds-action"
                  data-asset-admin-cancel
                  @click="pendingDeleteId = null"
                >
                  {{ ASSET_TEXT.cancel }}
                </button>
              </template>
              <button
                v-else
                type="button"
                class="button ds-action"
                data-asset-admin-delete
                @click="askDelete(asset)"
              >
                {{ ASSET_TEXT.remove }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

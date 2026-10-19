<script setup lang="ts">
import { computed } from 'vue';
import type { DatasourceRefScreen } from '../lib/datasource-model';
import { DATASOURCE_TEXT, screenEditHref } from '../lib/datasource-model';
import { formatDateTime } from '../lib/format';

/**
 * 数据源页的三个弹层（删除保护 / 轻确认 / 放弃修改）。
 *
 * **一律页面内弹层，不用 `window.confirm`**：嵌入式浏览器会静默返回 null，用户看到的是
 * 「点了没反应」。三态用 `kind` 区分，主按钮统一带 `data-ds-confirm`。
 */
const props = defineProps<{
  readonly kind: 'none' | 'confirm-delete' | 'delete-blocked' | 'discard';
  readonly name?: string;
  readonly refScreens?: readonly DatasourceRefScreen[];
}>();

const emit = defineEmits<{
  (event: 'cancel'): void;
  (event: 'confirm'): void;
}>();

const title = computed((): string => {
  switch (props.kind) {
    case 'confirm-delete':
      return `删除「${props.name ?? ''}」？`;
    case 'delete-blocked':
      return `无法删除：「${props.name ?? ''}」`;
    case 'discard':
      return DATASOURCE_TEXT.discardTitle;
    default:
      return '';
  }
});
</script>

<template>
  <div v-if="kind !== 'none'" class="ds-overlay">
    <div
      class="ds-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      :data-ds-dialog="kind"
    >
      <h2 class="ds-dialog__title">{{ title }}</h2>

      <template v-if="kind === 'confirm-delete'">
        <p class="ds-dialog__body">删除后不可撤销，引用它的大屏会显示「数据源不可用」。</p>
        <footer class="ds-dialog__actions">
          <button type="button" class="button" @click="emit('cancel')">
            {{ DATASOURCE_TEXT.cancel }}
          </button>
          <button
            type="button"
            class="button button--danger"
            data-ds-confirm="delete"
            @click="emit('confirm')"
          >
            {{ DATASOURCE_TEXT.remove }}
          </button>
        </footer>
      </template>

      <template v-else-if="kind === 'delete-blocked'">
        <p class="ds-dialog__body">
          仍有 {{ props.refScreens?.length ?? 0 }} 张大屏在使用它。{{ DATASOURCE_TEXT.refHint }}
        </p>
        <ul class="ds-ref-list" data-ds-ref-list="">
          <li v-for="screen in props.refScreens ?? []" :key="screen.id" class="ds-ref-list__item">
            <span class="ds-ref-list__name">{{ screen.name }}</span>
            <span v-if="screen.updatedAt !== ''" class="ds-ref-list__time">
              {{ formatDateTime(screen.updatedAt) }}
            </span>
            <a class="button ds-ref-list__link" :href="screenEditHref(screen.id)">
              {{ DATASOURCE_TEXT.goUnbind }}
            </a>
          </li>
        </ul>
        <footer class="ds-dialog__actions">
          <button type="button" class="button button--primary" data-ds-confirm="ok" @click="emit('cancel')">
            {{ DATASOURCE_TEXT.known }}
          </button>
        </footer>
      </template>

      <template v-else>
        <p class="ds-dialog__body">{{ DATASOURCE_TEXT.discardBody }}</p>
        <footer class="ds-dialog__actions">
          <button type="button" class="button" @click="emit('cancel')">
            {{ DATASOURCE_TEXT.keepEditing }}
          </button>
          <button
            type="button"
            class="button button--danger"
            data-ds-confirm="discard"
            @click="emit('confirm')"
          >
            {{ DATASOURCE_TEXT.discardConfirm }}
          </button>
        </footer>
      </template>
    </div>
  </div>
</template>

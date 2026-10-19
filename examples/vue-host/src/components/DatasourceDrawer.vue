<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../lib/api';
import {
  cellText,
  createDraft,
  DATASOURCE_TEXT,
  type DatabaseFileShape,
  type DatabaseSchemaShape,
  type DatasourceDetail,
  type DatasourceDraft,
  type DatasourcePreviewResponse,
  type DatasourceTestResponse,
  draftFromDetail,
  draftSignature,
  draftToConfig,
  emptyFilterDraft,
  emptyHeaderDraft,
  emptyParamDraft,
  fieldChangeImpact,
  formatBytes,
  isColumnSelectable,
  MASKED_SECRET,
  previewDatasetId,
  SQL_TEMPLATE,
  slugify,
  statusLabel,
  tableColumnLabel,
  testResultLabel,
  typeLabel,
  validateDraft,
} from '../lib/datasource-model';
import { formatDateTime } from '../lib/format';
import { showToast } from '../lib/toast';
import DatasourceDialogs from './DatasourceDialogs.vue';

/**
 * 数据源抽屉（PRD §10.3 / A28–A32、A34）。
 *
 * 与 React / Vanilla 两端同构：同一份 `datasource-model.ts` 状态形状、同一组 data 属性。
 * 两条容易踩的约束：
 * 1. 掩码 header 回填必须 `value:''`（把 `••••••••` 当值提交会写坏 token）。
 * 2. 测试/预览看 `body.ok`，HTTP 成功不代表业务成功。
 */
const props = defineProps<{
  // 显式允许 undefined：宿主 tsconfig 开了 exactOptionalPropertyTypes，
  // 否则父组件传 `:dataset-id="... : undefined"` 会被判成类型错误。
  readonly datasetId?: string | undefined;
  readonly autoPreview?: boolean | undefined;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'saved'): void;
}>();

const editing = computed((): boolean => props.datasetId !== undefined);
const detail = ref<DatasourceDetail | null>(null);
const draft = ref<DatasourceDraft>(createDraft('sqlite'));
const baseline = ref('');
const files = ref<readonly DatabaseFileShape[]>([]);
const schema = ref<DatabaseSchemaShape | null>(null);
const busy = ref<'load' | 'schema' | 'test' | 'preview' | 'save' | null>(
  props.datasetId === undefined ? null : 'load',
);
const test = ref<DatasourceTestResponse | null>(null);
const preview = ref<DatasourcePreviewResponse | null>(null);
const formError = ref<string | null>(null);
const conflict = ref<string | null>(null);
const askDiscard = ref(false);
const askFieldChange = ref(false);
let autoPreviewDone = false;

const readOnly = computed((): boolean => detail.value?.type === 'builtin');
const dirty = computed(
  (): boolean => baseline.value !== '' && draftSignature(draft.value) !== baseline.value,
);

const declaredTypes = computed((): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const column of schema.value?.columns[draft.value.table] ?? []) {
    map[column.name] = column.declaredType;
  }
  return map;
});

const columnsOfTable = computed(() => schema.value?.columns[draft.value.table] ?? []);

const idPreview = computed((): string =>
  slugify(draft.value.name) === '' ? 'custom.ds-<自动编号>' : previewDatasetId(draft.value.name, 1),
);

function patch(partial: Partial<DatasourceDraft>): void {
  draft.value = { ...draft.value, ...partial };
}

function buildConfig(): Record<string, unknown> {
  return draftToConfig(draft.value, declaredTypes.value);
}

function guard(): boolean {
  const check = validateDraft(draft.value);
  if (check.ok === false) {
    formError.value = check.message;
    return false;
  }
  formError.value = null;
  return true;
}

async function loadDetail(): Promise<void> {
  if (props.datasetId === undefined) {
    const fresh = createDraft('sqlite');
    draft.value = fresh;
    baseline.value = draftSignature(fresh);
    return;
  }
  busy.value = 'load';
  const response = await api.getDatasource(props.datasetId);
  busy.value = null;
  if (response.ok === false) {
    formError.value = response.error.message;
    return;
  }
  const next = draftFromDetail(response.data);
  detail.value = response.data;
  draft.value = next;
  baseline.value = draftSignature(next);
}

async function loadFiles(): Promise<void> {
  const response = await api.listDatabaseFiles();
  if (response.ok === false) {
    formError.value = response.error.message;
    return;
  }
  files.value = response.data.files;
}

async function loadSchema(): Promise<void> {
  if (draft.value.type !== 'sqlite' || draft.value.file === '') {
    schema.value = null;
    return;
  }
  busy.value = 'schema';
  const response = await api.describeDatabaseFile(draft.value.file);
  busy.value = null;
  if (response.ok === false) {
    schema.value = null;
    formError.value = response.error.message;
    return;
  }
  schema.value = response.data;
  formError.value = null;
}

async function runTest(): Promise<void> {
  if (guard() === false) return;
  busy.value = 'test';
  test.value = null;
  // 编辑态且表单没改：用已存配置测（能带上真实 header 原值）
  const response =
    editing.value && props.datasetId !== undefined && dirty.value === false
      ? await api.testDatasourceStored(props.datasetId)
      : await api.testDatasourceDraft({ type: draft.value.type, config: buildConfig() });
  busy.value = null;
  test.value =
    response.ok === false
      ? { ok: false, message: response.error.message, durationMs: 0 }
      : response.data;
}

async function runPreview(): Promise<void> {
  if (guard() === false) return;
  busy.value = 'preview';
  preview.value = null;
  const response = await api.previewDatasource({ type: draft.value.type, config: buildConfig() });
  busy.value = null;
  preview.value =
    response.ok === false
      ? {
          ok: false,
          message: response.error.message,
          durationMs: 0,
          fields: [],
          rows: [],
          rowCount: 0,
          truncated: false,
        }
      : response.data;
}

async function save(force = false): Promise<void> {
  if (guard() === false) return;
  // A36：已引用的数据源改字段前二次确认
  if (
    force === false &&
    detail.value !== null &&
    fieldChangeImpact(detail.value, draft.value, baseline.value)
  ) {
    askFieldChange.value = true;
    return;
  }
  askFieldChange.value = false;
  busy.value = 'save';
  conflict.value = null;
  const body = {
    name: draft.value.name.trim(),
    description: draft.value.description.trim() === '' ? null : draft.value.description.trim(),
    type: draft.value.type,
    config: buildConfig(),
  };
  const response =
    editing.value && props.datasetId !== undefined
      ? await api.updateDatasource(props.datasetId, body)
      : await api.createDatasource(body);
  busy.value = null;
  if (response.ok === false) {
    const suggested = response.error.payload?.suggestedId;
    if (response.error.code === 'DATASOURCE_ID_CONFLICT' && typeof suggested === 'string') {
      conflict.value = suggested;
    }
    formError.value = response.error.message;
    showToast(`${DATASOURCE_TEXT.saveFailed}：${response.error.message}`, 'error');
    return;
  }
  showToast(DATASOURCE_TEXT.saveOk, 'success');
  emit('saved');
}

function requestClose(): void {
  if (dirty.value && readOnly.value === false) {
    askDiscard.value = true;
    return;
  }
  emit('close');
}

function adoptSuggestion(): void {
  // 服务端不会自动加后缀：把名称改成「… 2」让 slug 自然落到建议名
  patch({ name: `${draft.value.name} 2` });
  conflict.value = null;
}

function removeFile(): void {
  files.value = [];
  void loadFiles();
}

onMounted(async () => {
  await loadDetail();
  if (draft.value.type === 'sqlite') {
    await loadFiles();
    await loadSchema();
  }
  if (props.autoPreview === true && autoPreviewDone === false) {
    autoPreviewDone = true;
    await runPreview();
  }
});

// 换库文件 → 重新枚举表结构（表名与列都会失效）
watch(
  (): string => draft.value.file,
  async (): Promise<void> => {
    await loadSchema();
  },
);
</script>

<template>
  <div class="ds-overlay ds-overlay--right">
    <section
      class="ds-drawer"
      role="dialog"
      aria-modal="true"
      :aria-label="editing ? '编辑数据源' : '新建数据源'"
      data-ds-form=""
    >
      <header class="ds-drawer__head">
        <h2>{{ editing ? `编辑「${detail?.name ?? ''}」` : '新建数据源' }}</h2>
        <button type="button" class="button" @click="requestClose">
          {{ DATASOURCE_TEXT.close }}
        </button>
      </header>

      <div class="ds-drawer__body">
        <p v-if="busy === 'load'" class="ds-muted">{{ DATASOURCE_TEXT.loading }}</p>

        <template v-else-if="readOnly && detail !== null">
          <section class="ds-section">
            <h3 class="ds-section__title">{{ DATASOURCE_TEXT.builtinFieldsTitle }}</h3>
            <p class="ds-muted">
              {{ detail.datasetId }} · {{ detail.name }} · {{ statusLabel(detail.status) }}
            </p>
            <table class="ds-table ds-table--compact">
              <thead>
                <tr>
                  <th scope="col">字段</th>
                  <th scope="col">类型</th>
                  <th scope="col">可空</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="field in detail.fields" :key="field.id">
                  <td>{{ field.label }}</td>
                  <td>{{ field.valueType }}</td>
                  <td>{{ field.nullable ? '是' : '否' }}</td>
                </tr>
              </tbody>
            </table>
            <ul v-if="detail.parameters.length > 0" class="ds-param-list">
              <li v-for="parameter in detail.parameters" :key="parameter.name">
                <code>:{{ parameter.name }}</code> {{ parameter.label }} · {{ parameter.valueType }}
                {{ parameter.required ? ' · 必填' : '' }}
              </li>
            </ul>
          </section>
        </template>

        <template v-else>
          <section class="ds-section">
            <h3 class="ds-section__title">基本信息</h3>
            <label class="ds-field">
              <span>名称</span>
              <input
                class="field"
                data-ds-field="name"
                :value="draft.name"
                maxlength="64"
                @input="patch({ name: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <label class="ds-field">
              <span>说明（可空）</span>
              <textarea
                class="field ds-field__area"
                data-ds-field="description"
                maxlength="200"
                :value="draft.description"
                @input="patch({ description: ($event.target as HTMLTextAreaElement).value })"
              />
            </label>
            <div class="ds-field">
              <span>类型</span>
              <div class="ds-types">
                <label v-for="type in ['sqlite', 'rest', 'static'] as const" :key="type" class="ds-types__item">
                  <input
                    type="radio"
                    name="ds-type"
                    :value="type"
                    :checked="draft.type === type"
                    :disabled="editing"
                    @change="patch({ type })"
                  />
                  {{ typeLabel(type) }}
                </label>
              </div>
            </div>
            <p class="ds-id-line">
              <span>datasetId</span>
              <code data-ds-id-preview="">{{ editing ? (detail?.datasetId ?? '') : idPreview }}</code>
              <span v-if="!editing" class="ds-muted">{{ DATASOURCE_TEXT.datasetIdImmutable }}</span>
            </p>
          </section>

          <section v-if="draft.type === 'sqlite'" class="ds-section">
            <h3 class="ds-section__title">SQLite</h3>
            <div class="ds-field">
              <span>数据库文件</span>
              <div class="ds-inline">
                <select
                  class="field"
                  data-ds-field="file"
                  :value="draft.file"
                  @change="
                    patch({
                      file: ($event.target as HTMLSelectElement).value,
                      table: '',
                      columns: [],
                      filters: [],
                    })
                  "
                >
                  <option value="">请选择…</option>
                  <option v-for="file in files" :key="file.name" :value="file.name">
                    {{ file.name }} · {{ formatBytes(file.sizeBytes) }} ·
                    {{ formatDateTime(file.modifiedAt) }}
                  </option>
                </select>
                <button type="button" class="button" @click="removeFile">
                  {{ DATASOURCE_TEXT.refresh }}
                </button>
              </div>
              <span v-if="files.length === 0" class="ds-muted">{{ DATASOURCE_TEXT.noDatabaseFiles }}</span>
            </div>

            <div class="ds-tabs" role="tablist">
              <button
                v-for="mode in ['table', 'sql'] as const"
                :key="mode"
                type="button"
                role="tab"
                class="button ds-tab"
                :class="{ 'ds-tab--active': draft.sqliteMode === mode }"
                :aria-selected="draft.sqliteMode === mode"
                :data-ds-mode="mode"
                @click="patch({ sqliteMode: mode })"
              >
                {{ mode === 'table' ? '表模式' : 'SQL 模式' }}
              </button>
            </div>

            <template v-if="draft.sqliteMode === 'table'">
              <div class="ds-field">
                <span>表 / 视图</span>
                <select
                  class="field"
                  data-ds-field="table"
                  :value="draft.table"
                  @change="
                    patch({
                      table: ($event.target as HTMLSelectElement).value,
                      columns: [],
                      filters: [],
                    })
                  "
                >
                  <option value="">请选择…</option>
                  <option v-for="table in schema?.tables ?? []" :key="table.name" :value="table.name">
                    {{ table.name }}{{ table.kind === 'view' ? '（视图）' : '' }}
                  </option>
                </select>
              </div>

              <div v-if="draft.table !== ''" class="ds-field">
                <span>列（勾选顺序即字段顺序）</span>
                <ul class="ds-columns" data-ds-columns="">
                  <li v-for="column in columnsOfTable" :key="column.name" class="ds-columns__item">
                    <label>
                      <input
                        type="checkbox"
                        :data-ds-column="column.name"
                        :checked="draft.columns.includes(column.name)"
                        :disabled="isColumnSelectable(column.declaredType) === false"
                        @change="
                          patch({
                            columns: ($event.target as HTMLInputElement).checked
                              ? [...draft.columns, column.name]
                              : draft.columns.filter((name) => name !== column.name),
                          })
                        "
                      />
                      {{ tableColumnLabel(column.name, column.declaredType) }}
                    </label>
                    <span
                      v-if="isColumnSelectable(column.declaredType) === false"
                      class="ds-tag"
                      :title="DATASOURCE_TEXT.columnTypeBlobHint"
                    >
                      {{ DATASOURCE_TEXT.columnTypeBlob }}
                    </span>
                  </li>
                </ul>
              </div>

              <div class="ds-field">
                <span>过滤条件（等值）</span>
                <table class="ds-table ds-table--compact">
                  <thead>
                    <tr>
                      <th scope="col">列</th>
                      <th scope="col">参数名</th>
                      <th scope="col"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(filter, index) in draft.filters" :key="`filter-${index}`" data-ds-filter-row="">
                      <td>
                        <select
                          class="field"
                          :value="filter.column"
                          @change="
                            patch({
                              filters: draft.filters.map((current, position) =>
                                position === index
                                  ? { ...current, column: ($event.target as HTMLSelectElement).value }
                                  : current,
                              ),
                            })
                          "
                        >
                          <option value="">请选择…</option>
                          <option
                            v-for="column in columnsOfTable.filter((entry) => entry.supported)"
                            :key="column.name"
                            :value="column.name"
                          >
                            {{ column.name }}
                          </option>
                        </select>
                      </td>
                      <td>
                        <input
                          class="field"
                          :value="filter.param"
                          @input="
                            patch({
                              filters: draft.filters.map((current, position) =>
                                position === index
                                  ? { ...current, param: ($event.target as HTMLInputElement).value }
                                  : current,
                              ),
                            })
                          "
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          class="button"
                          @click="patch({ filters: draft.filters.filter((_, position) => position !== index) })"
                        >
                          移除
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <button
                  type="button"
                  class="button"
                  data-ds-add-filter=""
                  @click="patch({ filters: [...draft.filters, emptyFilterDraft()] })"
                >
                  {{ DATASOURCE_TEXT.addFilter }}
                </button>
              </div>
            </template>

            <div v-else class="ds-field">
              <span>SQL（单条 SELECT / WITH）</span>
              <textarea
                class="field ds-field__sql"
                data-ds-field="sql"
                :value="draft.sql"
                :placeholder="SQL_TEMPLATE"
                @input="patch({ sql: ($event.target as HTMLTextAreaElement).value })"
              />
              <div class="ds-inline">
                <span class="ds-hint">{{ DATASOURCE_TEXT.readonlyHint }}</span>
                <button type="button" class="button" @click="patch({ sql: SQL_TEMPLATE })">
                  插入模板
                </button>
              </div>
            </div>
          </section>

          <section v-if="draft.type === 'rest'" class="ds-section">
            <h3 class="ds-section__title">REST API</h3>
            <label class="ds-field">
              <span>请求地址</span>
              <input
                class="field"
                data-ds-field="url"
                placeholder="http://127.0.0.1:3000/api/demo/press"
                :value="draft.url"
                @input="patch({ url: ($event.target as HTMLInputElement).value })"
              />
            </label>
            <div class="ds-field">
              <span>header</span>
              <table class="ds-table ds-table--compact">
                <thead>
                  <tr>
                    <th scope="col">名称</th>
                    <th scope="col">值</th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(header, index) in draft.headers" :key="`header-${index}`" data-ds-header-row="">
                    <td>
                      <input
                        class="field"
                        :value="header.name"
                        @input="
                          patch({
                            headers: draft.headers.map((current, position) =>
                              position === index
                                ? { ...current, name: ($event.target as HTMLInputElement).value }
                                : current,
                            ),
                          })
                        "
                      />
                    </td>
                    <td>
                      <!-- 掩码占位：值永远留空，服务端把空串当作「保留原值」 -->
                      <input
                        class="field"
                        type="password"
                        :placeholder="header.hasValue ? MASKED_SECRET : ''"
                        :value="header.value"
                        @input="
                          patch({
                            headers: draft.headers.map((current, position) =>
                              position === index
                                ? { ...current, value: ($event.target as HTMLInputElement).value }
                                : current,
                            ),
                          })
                        "
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        class="button"
                        @click="patch({ headers: draft.headers.filter((_, position) => position !== index) })"
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="ds-inline">
                <button
                  type="button"
                  class="button"
                  data-ds-add-header=""
                  @click="patch({ headers: [...draft.headers, emptyHeaderDraft()] })"
                >
                  {{ DATASOURCE_TEXT.addHeader }}
                </button>
                <span class="ds-hint">{{ DATASOURCE_TEXT.maskedSecretHint }}</span>
              </div>
            </div>
          </section>

          <section v-if="draft.type === 'static'" class="ds-section">
            <h3 class="ds-section__title">静态 JSON</h3>
            <div class="ds-field">
              <span>列（顺序即字段顺序）</span>
              <div class="ds-inline ds-inline--wrap">
                <span v-for="(column, index) in draft.staticColumns" :key="`column-${index}`" class="ds-col-input">
                  <input
                    class="field"
                    :value="column"
                    @input="
                      patch({
                        staticColumns: draft.staticColumns.map((current, position) =>
                          position === index
                            ? ($event.target as HTMLInputElement).value
                            : current,
                        ),
                      })
                    "
                  />
                  <button
                    type="button"
                    class="button"
                    @click="
                      patch({
                        staticColumns: draft.staticColumns.filter((_, position) => position !== index),
                        staticRows: draft.staticRows.map((row) =>
                          row.filter((_, position) => position !== index),
                        ),
                      })
                    "
                  >
                    ×
                  </button>
                </span>
                <button
                  type="button"
                  class="button"
                  data-ds-add-column=""
                  @click="
                    patch({
                      staticColumns: [...draft.staticColumns, `col${draft.staticColumns.length + 1}`],
                      staticRows: draft.staticRows.map((row) => [...row, '']),
                    })
                  "
                >
                  {{ DATASOURCE_TEXT.addColumn }}
                </button>
              </div>
            </div>
            <div class="ds-field">
              <span>数据（单元格只允许字符串/数字/布尔/null）</span>
              <table class="ds-table ds-table--compact">
                <thead>
                  <tr>
                    <th v-for="(column, index) in draft.staticColumns" :key="`head-${index}`" scope="col">
                      {{ column }}
                    </th>
                    <th scope="col"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in draft.staticRows" :key="`row-${rowIndex}`" data-ds-static-row="">
                    <td v-for="(_, columnIndex) in draft.staticColumns" :key="`cell-${rowIndex}-${columnIndex}`">
                      <input
                        class="field"
                        :value="row[columnIndex] ?? ''"
                        @input="
                          patch({
                            staticRows: draft.staticRows.map((currentRow, position) =>
                              position === rowIndex
                                ? draft.staticColumns.map((__, cell) =>
                                    cell === columnIndex
                                      ? ($event.target as HTMLInputElement).value
                                      : (currentRow[cell] ?? ''),
                                  )
                                : currentRow,
                            ),
                          })
                        "
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        class="button"
                        @click="patch({ staticRows: draft.staticRows.filter((_, position) => position !== rowIndex) })"
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <button
                type="button"
                class="button"
                data-ds-add-row=""
                @click="patch({ staticRows: [...draft.staticRows, draft.staticColumns.map(() => '')] })"
              >
                {{ DATASOURCE_TEXT.addRow }}
              </button>
            </div>
          </section>

          <section class="ds-section">
            <h3 class="ds-section__title">参数声明</h3>
            <table class="ds-table ds-table--compact">
              <thead>
                <tr>
                  <th scope="col">名称</th>
                  <th scope="col">label</th>
                  <th scope="col">类型</th>
                  <th scope="col">必填</th>
                  <th scope="col">默认值</th>
                  <th scope="col"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(parameter, index) in draft.params" :key="`param-${index}`" data-ds-param-row="">
                  <td>
                    <input
                      class="field"
                      :value="parameter.name"
                      @input="
                        patch({
                          params: draft.params.map((current, position) =>
                            position === index
                              ? { ...current, name: ($event.target as HTMLInputElement).value }
                              : current,
                          ),
                        })
                      "
                    />
                  </td>
                  <td>
                    <input
                      class="field"
                      :value="parameter.label"
                      @input="
                        patch({
                          params: draft.params.map((current, position) =>
                            position === index
                              ? { ...current, label: ($event.target as HTMLInputElement).value }
                              : current,
                          ),
                        })
                      "
                    />
                  </td>
                  <td>
                    <select
                      class="field"
                      :value="parameter.valueType"
                      @change="
                        patch({
                          params: draft.params.map((current, position) =>
                            position === index
                              ? {
                                  ...current,
                                  valueType:
                                    ($event.target as HTMLSelectElement).value === 'number'
                                      ? 'number'
                                      : 'string',
                                }
                              : current,
                          ),
                        })
                      "
                    >
                      <option value="string">string</option>
                      <option value="number">number</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      :checked="parameter.required"
                      @change="
                        patch({
                          params: draft.params.map((current, position) =>
                            position === index
                              ? { ...current, required: ($event.target as HTMLInputElement).checked }
                              : current,
                          ),
                        })
                      "
                    />
                  </td>
                  <td>
                    <input
                      class="field"
                      :value="parameter.defaultValue"
                      @input="
                        patch({
                          params: draft.params.map((current, position) =>
                            position === index
                              ? { ...current, defaultValue: ($event.target as HTMLInputElement).value }
                              : current,
                          ),
                        })
                      "
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      class="button"
                      @click="patch({ params: draft.params.filter((_, position) => position !== index) })"
                    >
                      移除
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              class="button"
              data-ds-add-param=""
              @click="patch({ params: [...draft.params, emptyParamDraft()] })"
            >
              {{ DATASOURCE_TEXT.addParam }}
            </button>
          </section>

          <p v-if="formError !== null" class="ds-error" role="alert" data-ds-form-error="">
            {{ formError }}
          </p>
          <p v-if="conflict !== null" class="ds-conflict" data-ds-conflict="">
            建议改用 <code>{{ conflict }}</code>
            <button type="button" class="button ds-action" @click="adoptSuggestion">
              {{ DATASOURCE_TEXT.conflictAdopt }}
            </button>
          </p>

          <p
            v-if="test !== null"
            class="ds-result"
            :class="test.ok ? 'ds-result--ok' : 'ds-result--error'"
            :data-ds-result="test.ok ? 'ok' : 'error'"
            role="status"
          >
            {{ testResultLabel(test.ok, test.message, test.rowCount) }}
          </p>

          <section class="ds-section" data-ds-preview="">
            <h3 class="ds-section__title">{{ DATASOURCE_TEXT.previewTitle }}</h3>
            <p v-if="busy === 'preview'" class="ds-muted">{{ DATASOURCE_TEXT.previewRunning }}</p>
            <p v-else-if="preview === null" class="ds-muted">{{ DATASOURCE_TEXT.previewEmpty }}</p>
            <p v-else-if="preview.ok === false" class="ds-error" role="alert">
              {{ DATASOURCE_TEXT.previewFailed }}：{{ preview.message }}
            </p>
            <template v-else>
              <p class="ds-muted">
                共 {{ preview.rowCount }} 行{{ preview.truncated ? ` · ${DATASOURCE_TEXT.truncatedHint}` : '' }} ·
                {{ preview.durationMs }}ms
              </p>
              <div class="ds-table-wrap">
                <table class="ds-table ds-table--compact">
                  <thead>
                    <tr>
                      <th v-for="field in preview.fields" :key="field.id" scope="col" :title="field.valueType">
                        {{ field.label }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, index) in preview.rows" :key="`preview-${index}`">
                      <td v-for="field in preview.fields" :key="`${index}-${field.id}`">
                        {{ cellText(row[field.id]) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </section>
        </template>
      </div>

      <footer class="ds-drawer__foot">
        <button
          type="button"
          class="button"
          data-ds-test-run=""
          :disabled="busy !== null"
          @click="runTest"
        >
          {{ busy === 'test' ? DATASOURCE_TEXT.testRunning : DATASOURCE_TEXT.test }}
        </button>
        <template v-if="!readOnly">
          <button
            type="button"
            class="button"
            data-ds-preview-run=""
            :disabled="busy !== null"
            @click="runPreview"
          >
            {{ busy === 'preview' ? DATASOURCE_TEXT.previewRunning : DATASOURCE_TEXT.preview }}
          </button>
          <button type="button" class="button" @click="requestClose">
            {{ DATASOURCE_TEXT.cancel }}
          </button>
          <button
            type="button"
            class="button button--primary"
            data-ds-save=""
            :disabled="busy !== null"
            @click="() => void save()"
          >
            {{ busy === 'save' ? '保存中…' : DATASOURCE_TEXT.save }}
          </button>
        </template>
      </footer>
    </section>
  </div>

  <DatasourceDialogs
    :kind="askFieldChange ? 'fields' : askDiscard ? 'discard' : 'none'"
    :ref-screens="askFieldChange && detail !== null ? detail.refScreens : []"
    @cancel="
      () => {
        askFieldChange = false;
        askDiscard = false;
      }
    "
    @confirm="
      () => {
        if (askFieldChange) {
          void save(true);
          return;
        }
        askDiscard = false;
        emit('close');
      }
    "
  />
</template>

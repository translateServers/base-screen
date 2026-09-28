import type { ScreenJsonValue, ScreenParseResult } from '@base-screen/contracts';
import type {
  BaseScreenDataField,
  BaseScreenMaterialModel,
  BaseScreenMaterialTabularDataAdapter,
} from '@base-screen/plugin-core';
import { KPI_CARD_MANIFEST } from './kpi-card';

/**
 * Vanilla 自有物料：自定义元素 + manifest（与 React / Vue 版同一 type/tagName）。
 * 渲染盒由引擎在赋值 model 前写死（宽高 = canonical component.size），因此
 * renderMaterial 不写 width/height；有边框时 box-sizing 为 border-box。
 */
class KpiCardElement extends HTMLElement {
  static readonly manifest = KPI_CARD_MANIFEST;

  #model: BaseScreenMaterialModel | undefined;

  get model(): BaseScreenMaterialModel {
    if (this.#model === undefined) throw new Error('Material model has not been set.');
    return this.#model;
  }

  set model(value: BaseScreenMaterialModel) {
    this.#model = value;
    this.renderMaterial();
  }

  connectedCallback(): void {
    this.renderMaterial();
  }

  protected renderMaterial(): void {
    const model = this.#model;
    if (model === undefined || !this.isConnected) return;
    this.replaceChildren();
    this.style.display = 'block';
    this.style.overflow = 'hidden';
    this.style.boxSizing = 'border-box';
    this.style.padding = '14px 16px';
    this.style.border = '1px solid rgba(57, 197, 187, 0.35)';
    this.style.borderRadius = '12px';
    this.style.background = 'rgba(15, 23, 42, 0.85)';
    this.style.color = '#e8eefb';
    this.style.font = '12px/1.4 system-ui, sans-serif';

    const label = this.ownerDocument.createElement('div');
    label.textContent = String(model.props.label ?? '');
    label.style.cssText = 'font-size:13px;color:#8ea3bd;';
    this.append(label);

    const value = this.ownerDocument.createElement('div');
    const projected = readProjectedValue(model);
    value.textContent = projected === null ? '--' : `${projected}${String(model.props.unit ?? '')}`;
    value.style.cssText =
      'margin-top:6px;font-size:30px;font-weight:700;color:#39c5bb;font-variant-numeric:tabular-nums;';
    this.append(value);
  }
}

function readProjectedValue(model: BaseScreenMaterialModel): number | null {
  if (model.dataState.status !== 'ready') return null;
  const value: unknown = model.dataState.value;
  if (value === null || typeof value !== 'object') return null;
  const raw = (value as { readonly value?: unknown }).value;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/**
 * 表格数据投影：角色 `value` 绑定的字段取第一行数值（三端同一语义）。
 * 返回值是普通对象字面量——它同时满足 `ScreenJsonValue` 的索引签名约束。
 */
const kpiCardAdapter: BaseScreenMaterialTabularDataAdapter = {
  adapt({ dataset, fields }): ScreenParseResult<ScreenJsonValue> {
    const field: BaseScreenDataField | undefined = fields.value?.[0];
    const row = dataset.rows[0];
    const raw = field === undefined || row === undefined ? undefined : row[field.id];
    if (
      field === undefined ||
      row === undefined ||
      typeof raw !== 'number' ||
      !Number.isFinite(raw)
    ) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: 'error',
            code: 'HOST_DATASET_BINDING_INVALID',
            path: [],
            message: 'KPI card binding is invalid.',
          },
        ],
      };
    }
    return { ok: true, value: { value: raw }, diagnostics: [] };
  },
};

// createMaterialDefinition 从元素类的静态属性读取表格适配器（与 harness 托管物料同一约定）。
Object.defineProperty(KpiCardElement, 'tabularDataAdapter', { value: kpiCardAdapter });

export { KpiCardElement, kpiCardAdapter };

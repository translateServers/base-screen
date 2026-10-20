import {
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenDataBinding,
  type ScreenDiagnostic,
  type ScreenJsonValue,
  type ScreenTabularDataset,
} from '@base-screen/contracts';
import { validateScreenDataBinding } from '@base-screen/core';
import type {
  BaseScreenMaterialCatalogEntry,
  BaseScreenMaterialDataState,
} from '@base-screen/plugin-core';
import { diagnostic } from './renderer-diagnostics.js';

/**
 * 逐组件投影：把「实例结果 + 组件字段映射」变成物料可用的 dataState。
 *
 * 这里**不发请求**：请求身份是数据源实例，属于 `DataSourceRuntime`；本模块只做本地
 * 变换，因此同一实例被两个组件以不同字段映射引用时，只发一次请求、各自投影一次。
 *
 * @param entry 物料 catalog 条目（提供 `dataBinding` 声明与 `tabularDataAdapter`）。
 * @param value 实例结果（整份，未按组件映射裁剪）。
 * @param binding 组件 `dataBinding`；`null` 表示不做字段映射。
 * @param componentId 仅用于诊断定位。
 * @param onDiagnostic 适配器抛异常时的诊断出口。
 */
export function projectDataSourceResult(
  entry: BaseScreenMaterialCatalogEntry,
  value: ScreenJsonValue,
  binding: ScreenDataBinding | null,
  componentId: string,
  onDiagnostic: ((diagnostic: ScreenDiagnostic) => void) | undefined,
): BaseScreenMaterialDataState {
  if (binding === null) return { status: 'ready', value };
  const dataset = parseScreenTabularDataset(value);
  if (!dataset.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_INVALID',
      message: 'Host dataset is invalid.',
    };
  }
  return adaptTabular(entry, dataset.value, binding, componentId, onDiagnostic, {
    bindingCode: 'Host dataset binding is invalid.',
    adapterCode: 'Host dataset adapter failed.',
  });
}

/**
 * 静态/变量取值投影：与 `projectDataSourceResult` 同一套字段映射规则，
 * 但物料必须以 `staticData.kind === 'tabular'` 声明「这个值会被当作表格处理」。
 */
export function projectStaticValue(
  entry: BaseScreenMaterialCatalogEntry,
  value: ScreenJsonValue,
  binding: ScreenDataBinding | null,
): BaseScreenMaterialDataState {
  if (entry.manifest.staticData?.kind !== 'tabular') {
    return { status: 'ready', value };
  }
  const dataset = parseScreenTabularDataset(value);
  if (!dataset.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_INVALID',
      message: 'Static dataset is invalid.',
    };
  }
  if (binding === null) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: 'Static dataset binding is invalid.',
    };
  }
  return adaptTabular(entry, dataset.value, binding, undefined, undefined, {
    bindingCode: 'Static dataset binding is invalid.',
    adapterCode: 'Static dataset adapter failed.',
  });
}

function adaptTabular(
  entry: BaseScreenMaterialCatalogEntry,
  dataset: ScreenTabularDataset,
  binding: ScreenDataBinding,
  componentId: string | undefined,
  onDiagnostic: ((diagnostic: ScreenDiagnostic) => void) | undefined,
  messages: { readonly bindingCode: string; readonly adapterCode: string },
): BaseScreenMaterialDataState {
  const declaration = entry.manifest.dataBinding;
  const adapter = entry.tabularDataAdapter;
  if (declaration === undefined || adapter === undefined) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: messages.bindingCode,
    };
  }
  const validated = validateScreenDataBinding(binding, dataset.fields, declaration.roles);
  if (!validated.ok) {
    return {
      status: 'error',
      code: 'HOST_DATASET_BINDING_INVALID',
      message: messages.bindingCode,
    };
  }
  try {
    const adapted = adapter.adapt({ dataset, fields: validated.value.fields });
    if (!adapted.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: messages.adapterCode,
      };
    }
    const parsed = parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
    if (!parsed.ok) {
      return {
        status: 'error',
        code: 'HOST_DATASET_ADAPTER_FAILED',
        message: messages.adapterCode,
      };
    }
    return { status: 'ready', value: parsed.value };
  } catch {
    if (componentId !== undefined) {
      onDiagnostic?.(
        diagnostic(
          'PLUGIN_CORE_RENDER_FAILED',
          ['components', componentId, 'dataBinding'],
          'Material dataset adapter raised an exception.',
        ),
      );
    }
    return {
      status: 'error',
      code: 'HOST_DATASET_ADAPTER_FAILED',
      message: messages.adapterCode,
    };
  }
}

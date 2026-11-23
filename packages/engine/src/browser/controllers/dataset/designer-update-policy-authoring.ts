import {
  readScreenComponentValueRef,
  type ScreenDataSource,
  type ScreenDiagnostic,
  type ScreenDocument,
  type ScreenParseResult,
  type ScreenPushRetainPolicy,
  type ScreenUpdatePolicy,
} from '@base-screen/contracts';
import type { ScreenDocumentTransaction } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type {
  DesignerDataSourcePushDelivery,
  DesignerDatasetAuthoringView,
} from '../../dom/dataset/designer-dataset-types.js';

/**
 * 工作台「更新方式」写回文档（ADR-0104 切片 5 补完）。
 *
 * 写入对象只有一种：组件经 `dataValue` 引用的**文档级实例**（`document.dataSources` 里真实存在、
 * 且没有被宿主标 `readOnly`）。旧形态内联数据源（`component.dataSource`）的派生实例不在
 * `dataSources` 里，没有可写的落点；这时只发宿主事件，并提示「应用数据源后写入」——
 * 首次应用绑定新建实例时会把当前选择一并带上（见 `authoringUpdatePolicyForNewInstance`）。
 */

/** 设置名：只有这四项会改 `updatePolicy`；受控模式 / 禁止加载态不是文档字段。 */
export const UPDATE_POLICY_SETTINGS: ReadonlySet<string> = new Set([
  'refreshStrategy',
  'refreshInterval',
  'pushFallbackInterval',
  'pushRetainRows',
]);

/**
 * 工作台设置 → `updatePolicy`。
 *
 * `previous` 用来保留面板上没有控件的字段（`retain.seconds` / `retain.timeField`），否则
 * 改一次回退间隔就会把宿主或手写文档里的按时长保留悄悄删掉。
 */
export function authoringToUpdatePolicy(
  authoring: DesignerDatasetAuthoringView,
  previous: ScreenUpdatePolicy | undefined,
  delivery: DesignerDataSourcePushDelivery | undefined,
): ScreenUpdatePolicy {
  switch (authoring.refreshStrategy) {
    case 'once':
      return { mode: 'once' };
    case 'manual':
      return { mode: 'manual' };
    case 'auto':
      return { mode: 'auto', intervalSeconds: authoring.refreshInterval };
    case 'push': {
      const retain = pushRetain(authoring, previous, delivery);
      const fallback = authoring.pushFallbackInterval;
      return {
        mode: 'push',
        ...(fallback === undefined || fallback <= 0 ? {} : { fallbackIntervalSeconds: fallback }),
        ...(retain === undefined ? {} : { retain }),
      };
    }
  }
}

function pushRetain(
  authoring: DesignerDatasetAuthoringView,
  previous: ScreenUpdatePolicy | undefined,
  delivery: DesignerDataSourcePushDelivery | undefined,
): ScreenPushRetainPolicy | undefined {
  const kept = previous?.mode === 'push' ? previous.retain : undefined;
  // 行数控件只对 append 型来源出现；不出现时原样保留文档里已有的窗口。
  if (delivery?.append !== true || authoring.pushRetainRows === undefined) return kept;
  return { ...kept, rows: authoring.pushRetainRows };
}

/** 两份策略是否等价：缺省策略与 `{ mode: 'manual' }` 同义（运行时都不自动刷新）。 */
export function sameUpdatePolicy(
  left: ScreenUpdatePolicy | undefined,
  right: ScreenUpdatePolicy | undefined,
): boolean {
  return canonical(left) === canonical(right);
}

function canonical(policy: ScreenUpdatePolicy | undefined): string {
  if (policy === undefined || policy.mode === 'manual') return '{"mode":"manual"}';
  const retain = policy.retain;
  return JSON.stringify({
    mode: policy.mode,
    intervalSeconds: policy.intervalSeconds ?? null,
    fallbackIntervalSeconds: policy.fallbackIntervalSeconds ?? null,
    retain:
      retain === undefined
        ? null
        : {
            rows: retain.rows ?? null,
            seconds: retain.seconds ?? null,
            timeField: retain.timeField ?? null,
          },
  });
}

/** 写回落点：文档级实例，或说明为什么没有落点。 */
export type DesignerUpdatePolicyTarget =
  | { readonly kind: 'document'; readonly instance: ScreenDataSource }
  | { readonly kind: 'inline' }
  | { readonly kind: 'read-only'; readonly instance: ScreenDataSource };

export function readUpdatePolicyTarget(
  document: ScreenDocument | undefined,
  componentId: string | null,
): DesignerUpdatePolicyTarget {
  const component = document?.components.find((candidate) => candidate.id === componentId);
  if (document === undefined || component === undefined) return { kind: 'inline' };
  const ref = readScreenComponentValueRef(component);
  if (ref?.kind !== 'data-source-field') return { kind: 'inline' };
  // 只看 `document.dataSources`：派生实例（旧形态组件合成出来的）不在这里，不可写。
  const instance = (document.dataSources ?? []).find(
    (candidate) => candidate.id === ref.dataSourceId,
  );
  if (instance === undefined) return { kind: 'inline' };
  if (instance.readOnly === true) return { kind: 'read-only', instance };
  return { kind: 'document', instance };
}

/**
 * 生成写回事务。返回 `value: null` 表示无需写（策略未变）。
 *
 * 推送门控与作者面一致：来源声明了推送能力，或实例本来就是 `push`（宿主暂时撤掉了
 * `subscribe` 不应逼作者改掉文档，运行时会按回退策略处理）。
 */
export function createUpdatePolicyTransaction(
  document: ScreenDocument,
  instance: ScreenDataSource,
  next: ScreenUpdatePolicy,
  delivery: DesignerDataSourcePushDelivery | undefined,
): ScreenParseResult<ScreenDocumentTransaction | null> {
  if (sameUpdatePolicy(instance.updatePolicy, next)) {
    return { ok: true, value: null, diagnostics: [] };
  }
  if (next.mode === 'push' && delivery === undefined && instance.updatePolicy?.mode !== 'push') {
    return {
      ok: false,
      diagnostics: [
        policyDiagnostic(instance.id, DESIGNER_UI_TEXT.dataSource.refreshPushUnsupported),
      ],
    };
  }
  const { updatePolicy: _previous, ...rest } = instance;
  // 「手动」写成省略字段：与缺省同义，旧文档不会因为点开过一次下拉就多出一行。
  const updated: ScreenDataSource = next.mode === 'manual' ? rest : { ...rest, updatePolicy: next };
  const dataSources = (document.dataSources ?? []).map((candidate) =>
    candidate.id === instance.id ? updated : candidate,
  );
  return {
    ok: true,
    value: { commands: [{ type: 'replace-data-sources', dataSources }] },
    diagnostics: [],
  };
}

function policyDiagnostic(instanceId: string, message: string): ScreenDiagnostic {
  return {
    severity: 'error',
    code: 'DATA_SOURCE_UPDATE_POLICY_INVALID',
    path: ['dataSources', instanceId, 'updatePolicy', 'mode'],
    message,
  };
}

/**
 * 首次应用数据集绑定、新建实例时带上的策略。数据集来源不支持推送（第二阶段），
 * 「手动」与缺省同义，两者都不写。
 */
export function authoringUpdatePolicyForNewInstance(
  authoring: DesignerDatasetAuthoringView,
): ScreenUpdatePolicy | undefined {
  if (authoring.refreshStrategy === 'manual' || authoring.refreshStrategy === 'push')
    return undefined;
  return authoringToUpdatePolicy(authoring, undefined, undefined);
}

/**
 * 文档策略变了（撤销 / 重做 / 宿主改写）而工作台还停在旧选择时，按文档回显。
 * 只改「更新方式」四个字段，编辑器模式、过滤器、受控模式等本地设置原样保留；
 * 与文档等价时返回原对象（调用方据此判断要不要重绘）。
 */
export function reconcileAuthoringWithPolicy(
  authoring: DesignerDatasetAuthoringView,
  policy: ScreenUpdatePolicy | undefined,
  delivery: DesignerDataSourcePushDelivery | undefined,
): DesignerDatasetAuthoringView {
  if (sameUpdatePolicy(authoringToUpdatePolicy(authoring, policy, delivery), policy)) {
    return authoring;
  }
  const { pushFallbackInterval: _fallback, pushRetainRows: _rows, ...local } = authoring;
  const mode = policy?.mode ?? 'manual';
  return {
    ...local,
    refreshStrategy: mode,
    refreshInterval:
      policy?.mode === 'auto' ? (policy.intervalSeconds ?? 30) : authoring.refreshInterval,
    ...(policy?.mode === 'push' && policy.fallbackIntervalSeconds !== undefined
      ? { pushFallbackInterval: policy.fallbackIntervalSeconds }
      : {}),
    ...(policy?.mode === 'push' && policy.retain?.rows !== undefined
      ? { pushRetainRows: policy.retain.rows }
      : {}),
  };
}

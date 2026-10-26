import type { ScreenDiagnostic, ScreenJsonObject } from '@base-screen/contracts';
import type {
  BaseScreenHostConditionalStyleAuthoringPort,
  BaseScreenHostConditionalStyleBinding,
  BaseScreenHostConditionalStyleSource,
} from '@base-screen/plugin-core';
import type { HostAlarmBindings, HostAlarmLevel } from './host-alarm-controller';

/**
 * 宿主告警 → 基座「业务条件样式」作者口的适配层。
 *
 * 引擎负责渲染表单与调用时序；这里只做三件事：
 * 1) 把告警 key/等级声明成条件源（展示名由宿主拥有）；
 * 2) 把按屏的嵌套绑定投影成单个组件的扁平绑定；
 * 3) 保存时重建该组件的完整绑定，成功后热更新告警控制器。
 *
 * 三端（vanilla / react / vue）逐字共享，与 `host-resource-authoring.ts` 同一对等约定。
 */

export const HOST_ALARM_LEVELS: readonly HostAlarmLevel[] = ['warning', 'critical', 'info'];

export const HOST_ALARM_LEVEL_LABELS: Readonly<Record<HostAlarmLevel, string>> = {
  warning: '警告',
  critical: '严重',
  info: '提示',
};

/** 演示 key 的展示名；未登记的 key 直接显示原值（宿主仍可绑定）。 */
const HOST_ALARM_SOURCE_LABELS: Readonly<Record<string, string>> = {
  'alarm.open': '未处理告警 (alarm.open)',
};

export type AlarmBindingsSaveResult =
  | { readonly ok: true; readonly bindings: HostAlarmBindings }
  | { readonly ok: false; readonly message: string };

export interface HostAlarmStyleAuthoringOptions {
  readonly initialBindings: HostAlarmBindings;
  readonly save: (bindings: HostAlarmBindings) => Promise<AlarmBindingsSaveResult>;
  /** 保存成功后热更新告警控制器；之后引擎会重算当前组件。 */
  readonly onSaved: (bindings: HostAlarmBindings) => void;
}

export function createHostAlarmStyleAuthoring(
  options: HostAlarmStyleAuthoringOptions,
): BaseScreenHostConditionalStyleAuthoringPort {
  let current = options.initialBindings;
  return {
    sources: buildSources(current),
    bindings: (componentId) => listComponentBindings(current, componentId),
    async save(componentId, bindings) {
      const updated = replaceComponentBindings(current, componentId, bindings);
      const result = await options.save(updated);
      if (!result.ok) return failure(result.message);
      current = result.bindings;
      options.onSaved(current);
      return { ok: true, value: undefined, diagnostics: [] };
    },
  };
}

/** 只接受当前支持的形状；返回 undefined 表示响应不可用，调用方回退为空绑定。 */
export function parseHostAlarmBindings(input: unknown): HostAlarmBindings | undefined {
  if (!isPlainObject(input)) return undefined;
  const result: Record<string, Record<string, Record<string, Record<string, string>>>> = {};
  for (const [key, components] of Object.entries(input)) {
    if (!isPlainObject(components)) return undefined;
    const componentMap: Record<string, Record<string, Record<string, string>>> = {};
    for (const [componentId, levels] of Object.entries(components)) {
      if (!isPlainObject(levels)) return undefined;
      const levelMap: Record<string, Record<string, string>> = {};
      for (const [level, styles] of Object.entries(levels)) {
        if (!HOST_ALARM_LEVELS.includes(level as HostAlarmLevel)) return undefined;
        if (!isPlainObject(styles)) return undefined;
        const styleMap: Record<string, string> = {};
        for (const [styleKey, value] of Object.entries(styles)) {
          if (typeof value !== 'string') return undefined;
          styleMap[styleKey] = value;
        }
        levelMap[level] = styleMap;
      }
      componentMap[componentId] = levelMap;
    }
    result[key] = componentMap;
  }
  return result as HostAlarmBindings;
}

function buildSources(
  bindings: HostAlarmBindings,
): readonly BaseScreenHostConditionalStyleSource[] {
  const keys = [...new Set(['alarm.open', ...Object.keys(bindings)])];
  return keys.map((key) => ({
    id: key,
    label: HOST_ALARM_SOURCE_LABELS[key] ?? key,
    conditions: HOST_ALARM_LEVELS.map((level) => ({
      id: level,
      label: HOST_ALARM_LEVEL_LABELS[level],
    })),
  }));
}

function listComponentBindings(
  bindings: HostAlarmBindings,
  componentId: string,
): readonly BaseScreenHostConditionalStyleBinding[] {
  const result: BaseScreenHostConditionalStyleBinding[] = [];
  for (const [sourceId, components] of Object.entries(bindings)) {
    const levels = components[componentId];
    if (levels === undefined) continue;
    for (const level of HOST_ALARM_LEVELS) {
      const style = levels[level];
      if (style === undefined) continue;
      result.push({ sourceId, conditionId: level, style: { ...style } });
    }
  }
  return result;
}

/** 用作者面提交的完整列表替换该组件的绑定，保留其他组件与告警 key。 */
function replaceComponentBindings(
  current: HostAlarmBindings,
  componentId: string,
  bindings: readonly BaseScreenHostConditionalStyleBinding[],
): HostAlarmBindings {
  const result: Record<string, Record<string, HostAlarmBindings[string][string]>> = {};
  for (const [sourceId, components] of Object.entries(current)) {
    const kept: Record<string, HostAlarmBindings[string][string]> = {};
    for (const [id, levels] of Object.entries(components)) {
      if (id !== componentId) kept[id] = { ...levels };
    }
    if (Object.keys(kept).length > 0) result[sourceId] = kept;
  }
  for (const binding of bindings) {
    if (!isHostAlarmLevel(binding.conditionId)) continue;
    const style = binding.style;
    if (Object.keys(style).length === 0) continue;
    const components = (result[binding.sourceId] ??= {});
    const levels: Partial<Record<HostAlarmLevel, ScreenJsonObject>> = {
      ...(components[componentId] ?? {}),
    };
    levels[binding.conditionId] = {
      ...(levels[binding.conditionId] ?? {}),
      ...style,
    };
    components[componentId] = levels;
  }
  return result;
}

function isHostAlarmLevel(value: string): value is HostAlarmLevel {
  return HOST_ALARM_LEVELS.includes(value as HostAlarmLevel);
}

function failure(message: string): {
  readonly ok: false;
  readonly diagnostics: ScreenDiagnostic[];
} {
  return {
    ok: false,
    diagnostics: [
      {
        severity: 'error',
        code: 'AUTHORING_REQUEST_INVALID',
        path: ['hostConditionalStyle'],
        message,
      },
    ],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

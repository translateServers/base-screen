/**
 * 宿主侧告警绑定的有界结构检查。
 *
 * 形状是 `alarm key → component id → level → 样式覆盖`。这里只做宿主能确定的事：
 * 键名有界、等级属于冻结集合、样式值是字符串；具体的样式键是否属于目标物料由
 * 前端按 manifest 过滤、由渲染器在合并后再验一遍。与文档守卫一样失败关闭：
 * 不剥未知字段、不补默认值、不做类型转换。
 */

export const ALARM_BINDING_LEVELS = ['warning', 'critical', 'info'] as const;
export type AlarmBindingLevel = (typeof ALARM_BINDING_LEVELS)[number];

export type AlarmBindingStyles = Readonly<
  Partial<Record<AlarmBindingLevel, Readonly<Record<string, string>>>>
>;
export type AlarmBindings = Readonly<Record<string, Readonly<Record<string, AlarmBindingStyles>>>>;

export const MAX_ALARM_KEYS = 32;
export const MAX_ALARM_COMPONENTS = 64;
export const MAX_ALARM_STYLES = 16;
export const MAX_ALARM_BINDING_BYTES = 64 * 1024;

const MAX_LABEL_CODE_POINTS = 128;
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);
const LEVELS: ReadonlySet<string> = new Set(ALARM_BINDING_LEVELS);

export type AlarmBindingsValidation =
  | { readonly ok: true; readonly serialized: string }
  | { readonly ok: false; readonly reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidLabel(value: string): boolean {
  return value !== '' && [...value].length <= MAX_LABEL_CODE_POINTS && !FORBIDDEN_KEYS.has(value);
}

export function validateAlarmBindingsInput(input: unknown): AlarmBindingsValidation {
  if (!isPlainObject(input)) {
    return { ok: false, reason: 'alarm bindings must be an object' };
  }
  const alarmKeys = Object.keys(input);
  if (alarmKeys.length > MAX_ALARM_KEYS) {
    return { ok: false, reason: `alarm bindings exceed ${MAX_ALARM_KEYS} alarm keys` };
  }
  for (const alarmKey of alarmKeys) {
    if (!isValidLabel(alarmKey)) {
      return { ok: false, reason: `invalid alarm key: ${alarmKey}` };
    }
    const components = input[alarmKey];
    if (!isPlainObject(components)) {
      return { ok: false, reason: `alarm bindings.${alarmKey} must be an object` };
    }
    const componentIds = Object.keys(components);
    if (componentIds.length > MAX_ALARM_COMPONENTS) {
      return {
        ok: false,
        reason: `alarm bindings.${alarmKey} exceeds ${MAX_ALARM_COMPONENTS} components`,
      };
    }
    for (const componentId of componentIds) {
      if (!isValidLabel(componentId)) {
        return { ok: false, reason: `invalid component id: ${componentId}` };
      }
      const levels = components[componentId];
      if (!isPlainObject(levels)) {
        return {
          ok: false,
          reason: `alarm bindings.${alarmKey}.${componentId} must be an object`,
        };
      }
      const levelKeys = Object.keys(levels);
      if (levelKeys.length === 0) {
        return {
          ok: false,
          reason: `alarm bindings.${alarmKey}.${componentId} must declare at least one level`,
        };
      }
      if (levelKeys.length > ALARM_BINDING_LEVELS.length) {
        return {
          ok: false,
          reason: `alarm bindings.${alarmKey}.${componentId} has unknown levels`,
        };
      }
      for (const level of levelKeys) {
        if (!LEVELS.has(level)) {
          return {
            ok: false,
            reason: `alarm bindings.${alarmKey}.${componentId}.${level} is not a known level`,
          };
        }
        const style = levels[level];
        if (!isPlainObject(style)) {
          return {
            ok: false,
            reason: `alarm bindings.${alarmKey}.${componentId}.${level} must be an object`,
          };
        }
        const styleKeys = Object.keys(style);
        if (styleKeys.length === 0) {
          return {
            ok: false,
            reason: `alarm bindings.${alarmKey}.${componentId}.${level} must not be empty`,
          };
        }
        if (styleKeys.length > MAX_ALARM_STYLES) {
          return {
            ok: false,
            reason: `alarm bindings.${alarmKey}.${componentId}.${level} exceeds ${MAX_ALARM_STYLES} style keys`,
          };
        }
        for (const styleKey of styleKeys) {
          if (!isValidLabel(styleKey) || typeof style[styleKey] !== 'string') {
            return {
              ok: false,
              reason: `alarm bindings.${alarmKey}.${componentId}.${level}.${styleKey} must be a string`,
            };
          }
        }
      }
    }
  }

  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_ALARM_BINDING_BYTES) {
    return { ok: false, reason: `alarm bindings exceed ${MAX_ALARM_BINDING_BYTES} bytes` };
  }
  return { ok: true, serialized };
}

/** 读取已落库的配置；损坏的数据必须显式中断（fail-closed），不能静默当成空绑定。 */
export function parseStoredAlarmBindings(raw: string): AlarmBindings {
  const parsed: unknown = JSON.parse(raw);
  const validation = validateAlarmBindingsInput(parsed);
  if (!validation.ok) {
    throw new Error(`ALARM_BINDINGS_INVALID: ${validation.reason}`);
  }
  return JSON.parse(validation.serialized) as AlarmBindings;
}

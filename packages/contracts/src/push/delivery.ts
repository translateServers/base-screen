import {
  MAX_PUSH_INACTIVITY_TIMEOUT_SECONDS,
  MIN_PUSH_INACTIVITY_TIMEOUT_SECONDS,
} from '../document/limits.js';
import type { ScreenSourceDelivery } from '../types/push.js';

/** 能力声明校验的一条问题：`path` 相对 `delivery` 本身。 */
export interface ScreenSourceDeliveryIssue {
  readonly path: readonly string[];
  readonly message: string;
}

const DELIVERY_FIELDS = new Set(['push']);
const PUSH_FIELDS = new Set(['append', 'inactivityTimeoutSeconds']);

/**
 * 校验宿主侧推送能力声明（ADR-0104 §2.3）。资源类型贡献与来源目录项共用这一份规则，
 * 两处只负责把问题转成各自的诊断码。返回空数组表示合法。
 */
export function listScreenSourceDeliveryIssues(
  value: unknown,
): readonly ScreenSourceDeliveryIssue[] {
  if (!isRecord(value)) {
    return [{ path: [], message: 'Source delivery must be an object.' }];
  }
  const issues: ScreenSourceDeliveryIssue[] = [];
  for (const key of Object.keys(value)) {
    if (!DELIVERY_FIELDS.has(key)) {
      issues.push({ path: [key], message: `Unknown source delivery field "${key}".` });
    }
  }
  const push = value.push;
  if (push === undefined) return issues;
  if (!isRecord(push)) {
    issues.push({ path: ['push'], message: 'Source delivery push must be an object.' });
    return issues;
  }
  for (const key of Object.keys(push)) {
    if (!PUSH_FIELDS.has(key)) {
      issues.push({ path: ['push', key], message: `Unknown source delivery push field "${key}".` });
    }
  }
  if (push.append !== undefined && typeof push.append !== 'boolean') {
    issues.push({
      path: ['push', 'append'],
      message: 'Source delivery push.append must be boolean.',
    });
  }
  const timeout = push.inactivityTimeoutSeconds;
  if (
    timeout !== undefined &&
    !(
      typeof timeout === 'number' &&
      Number.isInteger(timeout) &&
      timeout >= MIN_PUSH_INACTIVITY_TIMEOUT_SECONDS &&
      timeout <= MAX_PUSH_INACTIVITY_TIMEOUT_SECONDS
    )
  ) {
    issues.push({
      path: ['push', 'inactivityTimeoutSeconds'],
      message: `Source delivery push.inactivityTimeoutSeconds must be an integer between ${MIN_PUSH_INACTIVITY_TIMEOUT_SECONDS} and ${MAX_PUSH_INACTIVITY_TIMEOUT_SECONDS}.`,
    });
  }
  return issues;
}

/** 规范化一份已通过校验的能力声明：去掉显式的 `undefined`，返回新对象。 */
export function normalizeScreenSourceDelivery(value: ScreenSourceDelivery): ScreenSourceDelivery {
  const push = value.push;
  if (push === undefined) return {};
  return {
    push: {
      ...(push.append !== undefined ? { append: push.append } : {}),
      ...(push.inactivityTimeoutSeconds !== undefined
        ? { inactivityTimeoutSeconds: push.inactivityTimeoutSeconds }
        : {}),
    },
  };
}

/** 该声明是否支持推送（`delivery.push` 存在即视为支持）。 */
export function supportsScreenSourcePush(delivery: ScreenSourceDelivery | undefined): boolean {
  return delivery?.push !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

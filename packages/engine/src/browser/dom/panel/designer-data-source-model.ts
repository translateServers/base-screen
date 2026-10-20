import type { ScreenJsonValue } from '@base-screen/contracts';
import { parseScreenJsonValue } from '@base-screen/contracts';

export { createInitialMaterialDataSource as createInitialDataSource } from '../../../common/operations/material-component/material-component.js';

/** 检查器 JSON 输入的统一解析口径：解析失败与非法 JSON 值都给 undefined，由调用方决定提示。 */
export function parseJsonDraft(value: string): ScreenJsonValue | undefined {
  try {
    const parsed = parseScreenJsonValue(JSON.parse(value));
    return parsed.ok ? parsed.value : undefined;
  } catch {
    return undefined;
  }
}

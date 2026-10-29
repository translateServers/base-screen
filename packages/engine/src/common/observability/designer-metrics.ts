/**
 * 度量事件：引擎只负责在关键动作发生时发一条事件，不计算指标、不联网、不持久化。
 *
 * 指标口径与采集在宿主侧（报告二 §9）；引擎给出的只是**稳定的基础事件名**，
 * 宿主按名字聚合即可，不需要解析 DOM 或猜测用户行为。
 */
export const BASE_SCREEN_METRIC_EVENT = 'base-screen-metric';

export type DesignerMetricName =
  | 'intent_submit'
  | 'clarify_open'
  | 'parameter_route'
  | 'direct_edit'
  | 'draft_created'
  | 'draft_discarded'
  | 'change_adopt'
  | 'change_reject'
  | 'guard_fail'
  | 'fix_preview'
  | 'fix_apply'
  | 'scene_preview'
  | 'scene_apply'
  | 'revert'
  | 'patch_record';

export interface DesignerMetricPayload {
  readonly source?: 'manual' | 'host' | 'agent';
  readonly componentId?: string;
  readonly unitId?: string;
  readonly scope?: 'screen' | 'components';
  readonly count?: number;
  readonly mode?: string;
}

export interface BaseScreenMetricEventDetail {
  readonly name: DesignerMetricName;
  /** 发生时刻（毫秒时间戳），由引擎给出，避免各宿主时钟口径不一。 */
  readonly at: number;
  readonly payload?: DesignerMetricPayload;
}

export function createDesignerMetric(
  name: DesignerMetricName,
  payload?: DesignerMetricPayload,
): BaseScreenMetricEventDetail {
  return {
    name,
    at: Date.now(),
    ...(payload === undefined ? {} : { payload }),
  };
}

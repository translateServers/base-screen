import type {
  ScreenBlueprintHostActionPort,
  ScreenBlueprintRuntimePort,
  ScreenHostDatasetPort,
  ScreenHostResourcePort,
  ScreenHostVariablePort,
  ScreenParseResult,
  ScreenResourceExecutionMode,
  ScreenResourceObserver,
} from '@base-screen/contracts';
import { isScreenHostDatasetPort } from '@base-screen/contracts';
import type {
  BaseScreenConditionalStylePort,
  BaseScreenMaterialCatalog,
  BaseScreenRuntimeContributionIndex,
} from '@base-screen/plugin-core';
import {
  isBaseScreenConditionalStylePort,
  isBaseScreenMaterialCatalog,
  isBaseScreenRuntimeContributionIndex,
  isScreenBlueprintHostActionPort,
  isScreenBlueprintRuntimePort,
  isScreenHostResourcePort,
  isScreenHostVariablePort,
} from './viewer-configuration-guards.js';
import { lifecycleFailure } from './viewer-lifecycle.js';

export interface BaseScreenViewerConfiguration {
  readonly catalog: BaseScreenMaterialCatalog;
  readonly resourcePort?: ScreenHostResourcePort;
  readonly datasetPort?: ScreenHostDatasetPort;
  readonly variablePort?: ScreenHostVariablePort;
  /** ADR-0059 宿主条件样式端口：configure-only（Renderer 创建时捕获，无独立 setter）。 */
  readonly conditionalStylePort?: BaseScreenConditionalStylePort;
  readonly runtimeContributions?: BaseScreenRuntimeContributionIndex;
  readonly blueprintRuntimePort?: ScreenBlueprintRuntimePort;
  readonly blueprintHostActionPort?: ScreenBlueprintHostActionPort;
  readonly resourceTimeoutMs?: number;
  readonly instanceId?: string;
  readonly mode?: ScreenResourceExecutionMode;
  readonly observer?: ScreenResourceObserver;
  /** 非持久化执行上下文附加信息（RB2）：提供时流入每次 resolve 与 observer 事件。 */
  readonly projectId?: string;
  readonly documentRevision?: string;
}

export type BaseScreenViewerRefreshOptions = {
  readonly componentId?: string;
  readonly trigger?: 'manual' | 'polling';
  readonly traceId?: string;
};

export type NormalizedBaseScreenViewerConfiguration = Omit<
  BaseScreenViewerConfiguration,
  'resourceTimeoutMs'
> & {
  readonly resourceTimeoutMs: number;
};

export function parseBaseScreenViewerConfiguration(
  configuration: BaseScreenViewerConfiguration,
): ScreenParseResult<NormalizedBaseScreenViewerConfiguration> {
  if (!isBaseScreenMaterialCatalog(configuration.catalog)) {
    return lifecycleFailure('Viewer catalog 必须是合法的物料目录。');
  }
  if (
    configuration.datasetPort !== undefined &&
    !isScreenHostDatasetPort(configuration.datasetPort)
  ) {
    return lifecycleFailure('Viewer dataset port must provide list, describe and query.');
  }
  const resourceTimeoutMs = configuration.resourceTimeoutMs ?? 15_000;
  if (
    !Number.isInteger(resourceTimeoutMs) ||
    resourceTimeoutMs < 100 ||
    resourceTimeoutMs > 60_000
  ) {
    return lifecycleFailure('resourceTimeoutMs 必须是 100..60000 的整数。');
  }
  if (
    configuration.resourcePort !== undefined &&
    !isScreenHostResourcePort(configuration.resourcePort)
  ) {
    return lifecycleFailure('Viewer resource port 必须是含 resolve 的对象。');
  }
  if (
    configuration.variablePort !== undefined &&
    !isScreenHostVariablePort(configuration.variablePort)
  ) {
    return lifecycleFailure('Viewer variable port 必须是含 resolve 的对象。');
  }
  if (
    configuration.conditionalStylePort !== undefined &&
    !isBaseScreenConditionalStylePort(configuration.conditionalStylePort)
  ) {
    return lifecycleFailure('Viewer conditional style port 必须是含 resolve 的对象。');
  }
  if (
    configuration.runtimeContributions !== undefined &&
    !isBaseScreenRuntimeContributionIndex(configuration.runtimeContributions)
  ) {
    return lifecycleFailure('Viewer runtime contributions 必须是含 getResourceType 的对象。');
  }
  if (
    configuration.blueprintRuntimePort !== undefined &&
    !isScreenBlueprintRuntimePort(configuration.blueprintRuntimePort)
  ) {
    return lifecycleFailure('Viewer blueprint runtime port 必须是含 emit 的对象。');
  }
  if (
    configuration.blueprintHostActionPort !== undefined &&
    !isScreenBlueprintHostActionPort(configuration.blueprintHostActionPort)
  ) {
    return lifecycleFailure('Viewer blueprint host action port 必须是含 execute 的对象。');
  }
  return {
    ok: true,
    value: { ...configuration, resourceTimeoutMs },
    diagnostics: [],
  };
}

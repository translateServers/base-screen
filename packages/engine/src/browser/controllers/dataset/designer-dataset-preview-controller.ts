import {
  parseScreenJsonValue,
  parseScreenTabularDataset,
  type ScreenJsonValue,
  type ScreenParseResult,
} from '@base-screen/contracts';
import { validateScreenHostResourceBinding } from '@base-screen/core';
import { DESIGNER_UI_TEXT } from '../../../common/ui-text/designer-ui-text.js';
import type {
  DesignerDatasetDraftView,
  DesignerDatasetPreviewTab,
} from '../../dom/dataset/designer-dataset-dom.js';
import type { DesignerDatasetControllerContext } from './designer-dataset-controller-context.js';
import { emptyDatasetPreview } from './designer-dataset-controller-context.js';

export function setDatasetPreviewTab(
  context: DesignerDatasetControllerContext,
  tab: DesignerDatasetPreviewTab,
): void {
  context.state.preview = { ...context.state.preview, tab };
  context.renderSurface();
}

export async function testDatasetDraft(context: DesignerDatasetControllerContext): Promise<void> {
  const descriptor = context.state.descriptor;
  const draft = context.state.draft;
  const component = context.currentComponent();
  const port = context.callbacks.getResourcePort();
  if (
    descriptor === undefined ||
    draft === undefined ||
    component === undefined ||
    port === undefined
  ) {
    return;
  }
  context.cancelPreview();
  const controller = new AbortController();
  const generation = context.state.previewGeneration;
  context.state.previewController = controller;
  context.state.preview = {
    ...emptyDatasetPreview(true),
    status: 'loading',
    tab: context.state.preview.tab === 'request' ? 'response' : context.state.preview.tab,
    message: DESIGNER_UI_TEXT.dataSource.previewLoading,
  };
  context.renderSurface();
  try {
    const params = await resolvePreviewParameters(context, draft, controller);
    if (controller.signal.aborted || generation !== context.state.previewGeneration) return;
    if (params === undefined) {
      context.state.previewController = undefined;
      context.state.preview = {
        ...emptyDatasetPreview(true),
        status: 'error',
        message: DESIGNER_UI_TEXT.dataSource.testVariableUnavailable,
      };
      context.state.feedbackText = context.state.preview.message;
      context.renderSurface();
      return;
    }
    const result = await port.resolve(
      {
        componentId: component.id,
        resourceType: draft.resourceType,
        resourceId: draft.resourceId,
        params,
      },
      { signal: controller.signal },
    );
    if (controller.signal.aborted || generation !== context.state.previewGeneration) return;
    context.state.previewController = undefined;
    if (!result.ok) {
      context.callbacks.report(result.diagnostics);
      setPreviewError(context);
      return;
    }
    const raw = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
    if (!raw.ok) {
      context.callbacks.report(raw.diagnostics);
      setPreviewError(context);
      return;
    }
    const consumer = adaptDatasetPreview(context, raw.value);
    if (!consumer.ok) {
      context.callbacks.report(consumer.diagnostics);
      setPreviewError(context);
      return;
    }
    context.state.preview = {
      status: 'ready',
      tab: context.state.preview.tab,
      rawValue: raw.value,
      consumerValue: consumer.value,
      message: DESIGNER_UI_TEXT.dataSource.testReady(datasetRecordCount(raw.value)),
      testedAt: new Date().toLocaleTimeString(),
      open: true,
    };
    context.state.feedbackText = context.state.preview.message;
    context.renderSurface();
  } catch {
    if (!controller.signal.aborted && generation === context.state.previewGeneration) {
      context.state.previewController = undefined;
      setPreviewError(context);
    }
  }
}

async function resolvePreviewParameters(
  context: DesignerDatasetControllerContext,
  draft: DesignerDatasetDraftView,
  controller: AbortController,
): Promise<Readonly<Record<string, ScreenJsonValue>> | undefined> {
  const params: Record<string, ScreenJsonValue> = {};
  const document = context.callbacks.getDocument();
  const hostVariables = new Map<string, string>();
  for (const [name, parameter] of Object.entries(draft.params)) {
    if (parameter.kind === 'literal') {
      params[name] = parameter.value;
      continue;
    }
    const variable = document?.variables.find((item) => item.name === parameter.name);
    if (variable?.type === 'static') {
      params[name] = variable.value;
      continue;
    }
    if (variable?.type !== 'host') return undefined;
    hostVariables.set(name, variable.variableId);
  }
  if (hostVariables.size === 0) return params;
  const port = context.callbacks.getVariablePort?.();
  if (port === undefined) return undefined;
  const ids = [...new Set(hostVariables.values())];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, 15_000);
    });
    const batch = Promise.all(
      ids.map(async (variableId) => ({
        variableId,
        result: await port.resolve({
          variableId,
          purpose: 'authoring-preview',
          signal: controller.signal,
        }),
      })),
    );
    const settled = await Promise.race([batch, timeout]);
    if (settled === undefined || controller.signal.aborted) return undefined;
    const values = new Map<string, ScreenJsonValue>();
    for (const { variableId, result } of settled) {
      if (!result.ok) return undefined;
      const parsed = parseScreenJsonValue(result.value, { maxBytes: 1024 * 1024 });
      if (!parsed.ok) return undefined;
      values.set(variableId, parsed.value);
    }
    for (const [name, variableId] of hostVariables) {
      const value = values.get(variableId);
      if (value === undefined) return undefined;
      params[name] = value;
    }
  } catch {
    return undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  return params;
}

function adaptDatasetPreview(
  context: DesignerDatasetControllerContext,
  value: ScreenJsonValue,
): ScreenParseResult<ScreenJsonValue> {
  const entry = context.currentEntry();
  const roles = entry?.manifest.dataBinding?.roles ?? [];
  if (roles.length === 0 || entry?.tabularDataAdapter === undefined) {
    return { ok: true, value, diagnostics: [] };
  }
  const dataset = parseScreenTabularDataset(value);
  if (!dataset.ok) return dataset;
  const binding = validateScreenHostResourceBinding(
    { fields: context.state.draft?.fields ?? {} },
    dataset.value.fields,
    roles,
  );
  if (!binding.ok) return binding;
  try {
    const adapted = entry.tabularDataAdapter.adapt({
      dataset: dataset.value,
      fields: binding.value.fields,
    });
    if (!adapted.ok) return adapted;
    return parseScreenJsonValue(adapted.value, { maxBytes: 1024 * 1024 });
  } catch {
    return {
      ok: false,
      diagnostics: [
        {
          severity: 'error',
          code: 'HOST_DATASET_ADAPTER_FAILED',
          path: [],
          message: DESIGNER_UI_TEXT.dataSource.testFailed,
        },
      ],
    };
  }
}

function setPreviewError(context: DesignerDatasetControllerContext): void {
  context.state.preview = {
    ...emptyDatasetPreview(true),
    status: 'error',
    message: DESIGNER_UI_TEXT.dataSource.testFailed,
  };
  context.state.feedbackText = context.state.preview.message;
  context.renderSurface();
}

export function cancelDatasetPreview(context: DesignerDatasetControllerContext): void {
  context.state.previewGeneration++;
  context.state.previewController?.abort();
  context.state.previewController = undefined;
}

export async function copyPreviewData(context: DesignerDatasetControllerContext): Promise<void> {
  const rawValue = context.state.preview.rawValue;
  context.callbacks.requestAuthoringAction?.('copy-data', {
    value: JSON.stringify(rawValue ?? null),
  });
  if (rawValue === undefined) {
    context.setFeedback(DESIGNER_UI_TEXT.dataSource.copyDataUnavailable);
    return;
  }
  let copied = false;
  try {
    copied = (await context.callbacks.copyText?.(JSON.stringify(rawValue, null, 2))) ?? false;
  } catch {
    copied = false;
  }
  context.setFeedback(
    copied
      ? DESIGNER_UI_TEXT.dataSource.copyDataSuccess
      : DESIGNER_UI_TEXT.dataSource.copyDataFailed,
  );
}

function datasetRecordCount(value: ScreenJsonValue): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const rows = (value as Readonly<Record<string, ScreenJsonValue>>).rows;
    if (Array.isArray(rows)) return rows.length;
  }
  return value === null ? 0 : 1;
}

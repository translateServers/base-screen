import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadScreenApis } from './apis.mjs';
import {
  collectDocumentDiagnostics,
  formatDiagnostic,
  normalizeScreenDocument,
} from './document.mjs';

const CANVAS_DIFF_FIELDS = [
  'width',
  'height',
  'backgroundColor',
  'background',
  'backgroundImage',
  'backgroundImageFit',
];

const COMPONENT_DIFF_FIELDS = [
  'type',
  'name',
  'parentId',
  'position',
  'size',
  'rotation',
  'zIndex',
  'status',
  'props',
  'style',
  'styleRules',
  'dataSource',
  'dataValue',
  'dataBinding',
];

/** Constrained layout intents reuse the designer's alignment/distribution math verbatim. */
const LAYOUT_OPERATIONS = {
  'align-left': { kind: 'align', axis: 'x', mode: 'start' },
  'align-h-center': { kind: 'align', axis: 'x', mode: 'center' },
  'align-right': { kind: 'align', axis: 'x', mode: 'end' },
  'align-top': { kind: 'align', axis: 'y', mode: 'start' },
  'align-v-center': { kind: 'align', axis: 'y', mode: 'center' },
  'align-bottom': { kind: 'align', axis: 'y', mode: 'end' },
  'distribute-horizontal': { kind: 'distribute', axis: 'x' },
  'distribute-vertical': { kind: 'distribute', axis: 'y' },
};

export async function createScreenProvider(screenFile) {
  const file = resolve(screenFile);
  const apis = await loadScreenApis();
  let input;
  try {
    input = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new Error(
      `Screen document could not be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const loaded = normalizeScreenDocument(apis, input);
  if (!loaded.ok)
    throw new Error(
      `Screen document is invalid: ${loaded.diagnostics.map(formatDiagnostic).join(', ')}`,
    );
  const document = loaded.document;
  const source = Object.freeze({
    file,
    migrated: loaded.migrated,
    migrationDecisions: loaded.decisions,
  });

  return Object.freeze({
    source,
    getScreen({ view = 'summary' } = {}) {
      return ok({
        source,
        data: view === 'full' ? document : summarizeScreenDocument(apis, document),
      });
    },
    /**
     * 对比度校验：输入是**渲染采样**（文本色、有效背景、字号、字重），不是声明样式。
     * 复用 core 的 WCAG 纯函数，判定与设计器内的守卫同源。
     */
    checkA11y({ samples, minRatio } = {}) {
      const issues = [];
      for (const sample of samples) {
        const componentId =
          typeof sample?.componentId === 'string' ? sample.componentId : 'unknown';
        const text = apis.parseCssColor(String(sample?.textColor ?? ''));
        const background = apis.parseCssColor(String(sample?.backgroundColor ?? ''));
        if (text === undefined || background === undefined) {
          issues.push({
            componentId,
            code: 'A11Y_COLOR_UNPARSEABLE',
            message: 'textColor and backgroundColor must be opaque hex or rgb colors.',
          });
          continue;
        }
        const fontSizePx = Number(sample?.fontSizePx ?? 16);
        const fontWeight = Number(sample?.fontWeight ?? 400);
        const requiredRatio =
          typeof minRatio === 'number' && minRatio > 0
            ? minRatio
            : apis.minimumContrastRatio(fontSizePx, fontWeight);
        const ratio = apis.contrastRatio(text, background);
        if (ratio >= requiredRatio) continue;
        const suggested = apis.suggestReadableColor(text, background, requiredRatio);
        issues.push({
          componentId,
          ratio: Math.round(ratio * 100) / 100,
          requiredRatio,
          textColor: apis.formatCssColor(text),
          backgroundColor: apis.formatCssColor(background),
          suggestedColor: suggested === null || suggested === undefined ? null : apis.formatCssColor(suggested),
        });
      }
      return ok({
        checked: samples.length,
        failed: issues.length,
        issues,
      });
    },
    getScreenSchema() {
      return ok(apis.SCREEN_DOCUMENT_JSON_SCHEMA);
    },
    validateScreen({ document: candidate } = {}) {
      const target =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!target.ok)
        return failure({ valid: false, migrated: false, diagnostics: target.diagnostics });
      const diagnostics = collectDocumentDiagnostics(apis, target.document);
      return ok({
        valid: diagnostics.length === 0,
        migrated: target.migrated,
        migrationDecisions: target.decisions,
        diagnostics,
      });
    },
    applyScreenCommands({ commands }) {
      // Commands are applied to the immutable snapshot only: the candidate document is returned,
      // never persisted. Persisting stays with the host that owns the document.
      const result = apis.applyScreenDocumentTransaction(document, { commands });
      if (!result.ok)
        return failure({
          applied: false,
          changedComponentIds: [],
          failedCommandIndex: result.failedCommandIndex,
          diagnostics: result.diagnostics,
        });
      return ok({
        applied: true,
        document: result.document,
        changedComponentIds: result.changedComponentIds,
        diagnostics: result.diagnostics,
      });
    },
    diffScreens({ before: base, after }) {
      const beforeTarget =
        base === undefined ? snapshotTarget(document) : normalizeScreenDocument(apis, base);
      const afterTarget = normalizeScreenDocument(apis, after);
      if (!beforeTarget.ok || !afterTarget.ok)
        return failure({
          equal: false,
          diagnostics: apis.sortScreenDiagnostics([
            ...(beforeTarget.ok ? [] : beforeTarget.diagnostics),
            ...(afterTarget.ok ? [] : afterTarget.diagnostics),
          ]),
        });
      const changes = diffScreenDocuments(apis, beforeTarget.document, afterTarget.document);
      return ok({
        equal: screenChangesEqual(changes),
        migrated: { before: beforeTarget.migrated, after: afterTarget.migrated },
        changes,
        diagnostics: [],
      });
    },
    proposeLayout({ document: candidate, componentIds, operation }) {
      const target =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!target.ok) return failure({ proposed: false, diagnostics: target.diagnostics });
      const source = target.document;
      const intent = LAYOUT_OPERATIONS[operation];
      if (intent === undefined)
        return failure({
          proposed: false,
          reason: `unsupported-operation: ${String(operation)}`,
          diagnostics: [],
        });
      const byId = new Map(source.components.map((component) => [component.id, component]));
      const missing = componentIds.filter((id) => !byId.has(id));
      if (missing.length > 0)
        return failure({
          proposed: false,
          reason: 'component-not-found',
          missing,
          diagnostics: [],
        });
      const components = componentIds.map((id) => byId.get(id));
      const deltas =
        intent.kind === 'align'
          ? apis.calculateScreenAlignment(components, intent.axis, intent.mode)
          : apis.calculateScreenDistribution(components, intent.axis);
      if (deltas.length === 0)
        return ok({
          proposed: false,
          reason: 'no-change',
          commands: [],
          changedComponentIds: [],
          diagnostics: [],
        });
      const commands = deltas.map(({ componentId, delta }) => {
        const component = byId.get(componentId);
        return {
          type: 'update-components',
          componentIds: [componentId],
          patch: {
            position: { x: component.position.x + delta.x, y: component.position.y + delta.y },
          },
        };
      });
      const applied = apis.applyScreenDocumentTransaction(source, { commands });
      if (!applied.ok)
        return failure({ proposed: false, commands, diagnostics: applied.diagnostics });
      return ok({
        proposed: true,
        operation,
        commands,
        document: applied.document,
        changedComponentIds: applied.changedComponentIds,
        geometry: auditGeometry(apis, applied.document),
        diagnostics: applied.diagnostics,
      });
    },
    auditScreen({ document: candidate, target, minComponentPx } = {}) {
      const audited =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!audited.ok)
        return failure({
          valid: false,
          diagnostics: audited.diagnostics,
          geometry: null,
          fit: null,
          complexity: null,
        });
      const diagnostics = collectDocumentDiagnostics(apis, audited.document);
      return ok({
        valid: diagnostics.length === 0,
        diagnostics,
        geometry: auditGeometry(apis, audited.document),
        fit: target === undefined ? null : auditFit(audited.document, target, minComponentPx),
        complexity: auditComplexity(apis, audited.document),
      });
    },
    /**
     * 复杂度预算：只做计数与阈值比较，不声称是渲染耗时。
     * 阈值可被调用方覆盖，默认值集中在这里，避免散落在文档里。
     */
    estimatePerf({ document: candidate, budget } = {}) {
      const target =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!target.ok)
        return failure({ valid: false, diagnostics: target.diagnostics, metrics: null, budget: null });
      const doc = target.document;
      const index = apis.buildComponentIndex(doc);
      let maxDepth = 0;
      let bindings = 0;
      let styleRules = 0;
      for (const component of doc.components) {
        maxDepth = Math.max(maxDepth, apis.getAncestorIds(index, component.id).length);
        if (component.dataSource !== null && component.dataSource !== undefined) bindings += 1;
        styleRules += (component.styleRules ?? []).length;
      }
      const limits = {
        maxComponents: 160,
        maxDepth: 6,
        maxBindings: 120,
        maxStyleRules: 400,
        ...(budget ?? {}),
      };
      const metrics = {
        components: doc.components.length,
        maxDepth,
        dataBindings: bindings,
        styleRules,
        blueprintRelations: doc.blueprint.relations.length,
      };
      const violations = [];
      if (metrics.components > limits.maxComponents)
        violations.push({ code: 'PERF_COMPONENTS', actual: metrics.components, limit: limits.maxComponents });
      if (metrics.maxDepth > limits.maxDepth)
        violations.push({ code: 'PERF_DEPTH', actual: metrics.maxDepth, limit: limits.maxDepth });
      if (metrics.dataBindings > limits.maxBindings)
        violations.push({ code: 'PERF_BINDINGS', actual: metrics.dataBindings, limit: limits.maxBindings });
      if (metrics.styleRules > limits.maxStyleRules)
        violations.push({ code: 'PERF_STYLE_RULES', actual: metrics.styleRules, limit: limits.maxStyleRules });
      return ok({ valid: violations.length === 0, metrics, budget: { limits, violations } });
    },
    /**
     * 分辨率适配：等比缩放 + 居中，画布与组件一起换算成命令。
     * 返回的是命令而不是已改文档——调用方仍需走 apply_screen_commands 才生效。
     */
    fitResolution({ document: candidate, target, minComponentPx } = {}) {
      const normalized =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!normalized.ok) return failure({ fit: null, commands: [], diagnostics: normalized.diagnostics });
      const doc = normalized.document;
      const scale = Math.min(target.width / doc.canvas.width, target.height / doc.canvas.height);
      const dx = (target.width - doc.canvas.width * scale) / 2;
      const dy = (target.height - doc.canvas.height * scale) / 2;
      const commands = [{ type: 'update-canvas', patch: { width: target.width, height: target.height } }];
      const below = [];
      for (const component of doc.components) {
        const width = Math.max(1, Math.round(component.size.width * scale));
        const height = Math.max(1, Math.round(component.size.height * scale));
        commands.push({
          type: 'update-components',
          componentIds: [component.id],
          patch: {
            position: {
              x: Math.round(component.position.x * scale + dx),
              y: Math.round(component.position.y * scale + dy),
            },
            size: { width, height },
          },
        });
        if (minComponentPx !== undefined && (width < minComponentPx || height < minComponentPx))
          below.push({ id: component.id, effective: { width, height } });
      }
      return ok({
        fit: { scale: round2(scale), offset: { x: round2(dx), y: round2(dy) }, below },
        commands,
      });
    },
    /**
     * 与基线快照做属性级 diff：回答「这份候选到底改了哪些字段」。
     * 与设计器内的变更卡共用 core 的同一份 diff 实现。
     */
    diffAgainstBaseline({ baseline, document: candidate } = {}) {
      const before = normalizeScreenDocument(apis, baseline);
      if (!before.ok) return failure({ equal: null, rows: [], diagnostics: before.diagnostics });
      const after =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!after.ok) return failure({ equal: null, rows: [], diagnostics: after.diagnostics });
      const rows = apis.diffScreenDocuments(before.document, after.document);
      return ok({
        equal: rows.length === 0,
        rows,
        changedComponentIds: rows.map((row) => row.componentId),
      });
    },
    exportScreen({ document: candidate } = {}) {
      const target =
        candidate === undefined
          ? snapshotTarget(document)
          : normalizeScreenDocument(apis, candidate);
      if (!target.ok) return failure({ diagnostics: target.diagnostics });
      const text = apis.serializeScreenDocument(target.document);
      return ok({ text, bytes: Buffer.byteLength(text, 'utf8') });
    },
    importScreen({ document: candidate }) {
      const target = normalizeScreenDocument(apis, candidate);
      if (!target.ok)
        return failure({
          migrated: false,
          migrationDecisions: target.decisions,
          diagnostics: target.diagnostics,
        });
      return ok({
        document: target.document,
        migrated: target.migrated,
        migrationDecisions: target.decisions,
        diagnostics: target.diagnostics,
      });
    },
  });
}

function snapshotTarget(document) {
  return { ok: true, document, migrated: false, decisions: [], diagnostics: [] };
}

function diffScreenDocuments(apis, before, after) {
  return {
    canvas: diffFields(apis, before.canvas, after.canvas, CANVAS_DIFF_FIELDS),
    components: diffComponents(apis, before.components, after.components),
    dataSources: diffById(apis, before.dataSources ?? [], after.dataSources ?? []),
    variables: diffById(apis, before.variables ?? [], after.variables ?? []),
    blueprint: {
      changed: !apis.screenJsonEquals(before.blueprint, after.blueprint),
      beforeRelations: before.blueprint.relations.length,
      afterRelations: after.blueprint.relations.length,
    },
  };
}

function diffFields(apis, before, after, fields) {
  if (apis.screenJsonEquals(before, after)) return null;
  return {
    changedFields: fields.filter(
      (field) => !apis.screenJsonEquals(before?.[field], after?.[field]),
    ),
  };
}

function diffComponents(apis, before, after) {
  const beforeById = new Map(before.map((component) => [component.id, component]));
  const identity = diffById(apis, before, after);
  const changed = [];
  for (const component of after) {
    const previous = beforeById.get(component.id);
    if (previous === undefined || apis.screenJsonEquals(previous, component)) continue;
    changed.push({
      id: component.id,
      fields: COMPONENT_DIFF_FIELDS.filter(
        (field) => !apis.screenJsonEquals(previous[field], component[field]),
      ),
    });
  }
  return { added: identity.added, removed: identity.removed, changed };
}

function diffById(apis, before, after) {
  const beforeById = new Map(before.map((entry) => [entry.id, entry]));
  const afterById = new Map(after.map((entry) => [entry.id, entry]));
  return {
    added: after.filter((entry) => !beforeById.has(entry.id)).map((entry) => entry.id),
    removed: before.filter((entry) => !afterById.has(entry.id)).map((entry) => entry.id),
    changed: after
      .filter((entry) => !apis.screenJsonEquals(beforeById.get(entry.id), entry))
      .map((entry) => entry.id),
  };
}

function screenChangesEqual(changes) {
  return (
    changes.canvas === null &&
    changes.components.added.length === 0 &&
    changes.components.removed.length === 0 &&
    changes.components.changed.length === 0 &&
    changes.dataSources.added.length === 0 &&
    changes.dataSources.removed.length === 0 &&
    changes.dataSources.changed.length === 0 &&
    changes.variables.added.length === 0 &&
    changes.variables.removed.length === 0 &&
    changes.variables.changed.length === 0 &&
    !changes.blueprint.changed
  );
}

function auditGeometry(apis, document) {
  const outsideCanvas = [];
  for (const component of document.components) {
    const bounds = apis.getScreenComponentBounds(component);
    const overflow = {
      left: round2(Math.max(0, -bounds.left)),
      top: round2(Math.max(0, -bounds.top)),
      right: round2(Math.max(0, bounds.right - document.canvas.width)),
      bottom: round2(Math.max(0, bounds.bottom - document.canvas.height)),
    };
    if (overflow.left > 0 || overflow.top > 0 || overflow.right > 0 || overflow.bottom > 0)
      outsideCanvas.push({ id: component.id, overflow });
  }
  return { outsideCanvas };
}

/**
 * Uniform-scale projection only (`fit`/`fill`). A layout re-solve for a target screen needs a
 * solver this snapshot-side check deliberately does not pretend to be; it answers "what would
 * uniform scaling do to this canvas at the target size". `minComponentPx` is an optional policy:
 * report components whose declared box would render below that many target pixels.
 */
function auditFit(document, target, minComponentPx) {
  const canvas = document.canvas;
  const fitScale = Math.min(target.width / canvas.width, target.height / canvas.height);
  const fillScale = Math.max(target.width / canvas.width, target.height / canvas.height);
  const fitWidth = canvas.width * fitScale;
  const fitHeight = canvas.height * fitScale;
  const canvasAspect = canvas.width / canvas.height;
  const targetAspect = target.width / target.height;
  const report = {
    target,
    targetMegapixels: round2((target.width * target.height) / 1_000_000),
    fitScale: round2(fitScale),
    fillScale: round2(fillScale),
    fitRendered: { width: round2(fitWidth), height: round2(fitHeight) },
    letterbox: {
      x: round2((target.width - fitWidth) / 2),
      y: round2((target.height - fitHeight) / 2),
    },
    fillCropped: {
      width: round2(canvas.width * fillScale - target.width),
      height: round2(canvas.height * fillScale - target.height),
    },
    aspectDeltaPercent: round2(Math.abs(targetAspect / canvasAspect - 1) * 100),
  };
  if (minComponentPx === undefined) return report;
  const below = [];
  for (const component of document.components) {
    const width = round2(component.size.width * fitScale);
    const height = round2(component.size.height * fitScale);
    if (width < minComponentPx || height < minComponentPx)
      below.push({ id: component.id, effective: { width, height } });
  }
  return {
    ...report,
    minComponentPx,
    belowMinComponentPx: { count: below.length, items: below.slice(0, 50) },
  };
}

/** Counts only — inputs for an agent's judgment, not measured render cost. */
function auditComplexity(apis, document) {
  const index = apis.buildComponentIndex(document);
  const materialTypes = {};
  let maxDepth = 0;
  let styleRules = 0;
  for (const component of document.components) {
    materialTypes[component.type] = (materialTypes[component.type] ?? 0) + 1;
    maxDepth = Math.max(maxDepth, apis.getAncestorIds(index, component.id).length);
    styleRules += (component.styleRules ?? []).length;
  }
  const dataSources = document.dataSources ?? [];
  const variables = document.variables ?? [];
  return {
    components: document.components.length,
    canvasMegapixels: round2((document.canvas.width * document.canvas.height) / 1_000_000),
    maxDepth,
    materialTypes,
    dataSources: dataSources.length,
    variables: variables.length,
    blueprintRelations: document.blueprint.relations.length,
    styleRules,
  };
}

function summarizeScreenDocument(apis, document) {
  const index = apis.buildComponentIndex(document);
  const dataSources = document.dataSources ?? [];
  const variables = document.variables ?? [];
  return {
    canvas: document.canvas,
    counts: {
      components: document.components.length,
      dataSources: dataSources.length,
      variables: variables.length,
      blueprintRelations: document.blueprint.relations.length,
    },
    components: document.components.map((component) => ({
      id: component.id,
      type: component.type,
      name: component.name,
      parentId: component.parentId,
      depth: apis.getAncestorIds(index, component.id).length,
      position: component.position,
      size: component.size,
      rotation: component.rotation,
      zIndex: component.zIndex,
      status: component.status,
      hasDataSource: component.dataSource !== null && component.dataSource !== undefined,
      hasStyleRules: (component.styleRules ?? []).length > 0,
      hasValue: component.dataValue !== null && component.dataValue !== undefined,
      hasBinding: component.dataBinding !== null && component.dataBinding !== undefined,
    })),
    dataSources: dataSources.map((instance) => ({
      id: instance.id,
      name: instance.name,
      sourceKind: instance.source.kind,
      readOnly: instance.readOnly === true,
    })),
    variables: variables.map((variable) => ({ id: variable.id, name: variable.name })),
  };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function ok(value) {
  return { ok: true, value, diagnostics: [] };
}

function failure(value) {
  return { ok: false, value, diagnostics: value.diagnostics ?? [] };
}

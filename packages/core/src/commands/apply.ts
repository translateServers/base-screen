import {
  isScreenThemeSlot,
  SCREEN_CANVAS_FIELDS,
  SCREEN_THEME_BASE_SLOTS,
  type ScreenDocument,
  screenJsonEquals,
} from '@base-screen/contracts';
import { componentsReferencingDataSources } from '../data/data-source-dependents.js';
import { prefixDiagnostic, sortDiagnostics } from '../internal/diagnostics.js';
import { assertCoreValidDocument } from '../internal/document.js';
import {
  applyAddBlueprintElementsCommand,
  applyAddDataSourcesCommand,
  applyAddVariablesCommand,
  applyRemoveBlueprintElementsCommand,
  applyRemoveVariablesCommand,
  applyUpdateDataSourceParamsCommand,
} from './apply-collection-commands.js';
import {
  applyAddComponentCommand,
  applyMoveComponentsCommand,
  applyRemoveComponentsCommand,
  applyReparentComponentsCommand,
  applyUpdateComponentsCommand,
} from './apply-component-commands.js';
import {
  applyReplaceDataSourcesCommand,
  changedDataSourceIds,
} from './apply-data-source-command.js';
import { applyRenameVariableCommand } from './apply-variable-command.js';
import { isExactPatch, isRecord } from './command-input.js';
import {
  finalizeScreenCommand,
  invalidScreenCommand,
  screenCommandDiagnostic,
  screenCommandFailure,
  screenCommandSuccess,
} from './command-result.js';
import type {
  ScreenCommandResult,
  ScreenDocumentCommand,
  ScreenDocumentTransaction,
  ScreenTransactionResult,
} from './types.js';

// canvas patch 字段白名单来自契约（`SCREEN_CANVAS_FIELDS`）而不是这里再抄一份：
// 抄一份的代价是契约新增字段时这里静默拒绝，且没有任何测试会红（ADR-0043：可选字段在
// patch 中值为 null 表示删除该字段——canvas 全部字段均不可空，null 无歧义）。
const CANVAS_FIELDS = new Set<string>(SCREEN_CANVAS_FIELDS);

export function applyScreenDocumentCommand(
  document: ScreenDocument,
  command: ScreenDocumentCommand,
): ScreenCommandResult {
  assertCoreValidDocument(document);
  return applyValidatedCommand(document, command);
}

export function applyScreenDocumentTransaction(
  document: ScreenDocument,
  transaction: ScreenDocumentTransaction,
): ScreenTransactionResult {
  assertCoreValidDocument(document);
  if (!isRecord(transaction) || !Array.isArray(transaction.commands)) {
    return {
      ok: false,
      document,
      failedCommandIndex: 0,
      diagnostics: invalidScreenCommand('Transaction commands must be an array.', ['commands']),
    };
  }
  if (transaction.commands.length > 1000) {
    return {
      ok: false,
      document,
      failedCommandIndex: 0,
      diagnostics: [
        screenCommandDiagnostic(
          'CORE_COMMAND_LIMIT_EXCEEDED',
          ['commands'],
          'Transaction exceeds 1000 commands.',
        ),
      ],
    };
  }

  let current = document;
  for (let index = 0; index < transaction.commands.length; index++) {
    // 事务入口已断言语义，后续命令的输入来自上一命令 finalize 的已校验输出，
    // 无需逐命令重复全量断言。
    const result = applyValidatedCommand(current, transaction.commands[index]!);
    if (!result.ok) {
      return {
        ok: false,
        document,
        failedCommandIndex: index,
        diagnostics: sortDiagnostics(
          result.diagnostics.map((item) => prefixDiagnostic(item, ['commands', index])),
        ),
      };
    }
    current = result.document;
  }

  return {
    ok: true,
    document: current,
    changedComponentIds: getNetChangedComponentIds(document, current),
    diagnostics: [],
  };
}

function applyValidatedCommand(
  document: ScreenDocument,
  command: ScreenDocumentCommand,
): ScreenCommandResult {
  if (!isRecord(command) || typeof command.type !== 'string') {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Command must be an object with a known type.', []),
    );
  }

  switch (command.type) {
    case 'update-canvas':
      return applyCanvas(document, command.patch);
    case 'add-component':
      return applyAddComponentCommand(document, command.component);
    case 'update-components':
      return applyUpdateComponentsCommand(document, command.componentIds, command.patch);
    case 'remove-components':
      return applyRemoveComponentsCommand(document, command.componentIds);
    case 'reparent-components':
      return applyReparentComponentsCommand(document, command.componentIds, command.parentId);
    case 'replace-blueprint':
      return applyBlueprint(document, command.blueprint);
    case 'replace-data-sources':
      return applyReplaceDataSourcesCommand(document, command.dataSources);
    case 'replace-variables':
      return applyVariables(document, command.variables);
    case 'replace-sub-canvases':
      return applySubCanvases(document, command.subCanvases, command.startCanvasId);
    case 'move-components':
      return applyMoveComponentsCommand(document, command.componentIds, command.canvasId);
    case 'rename-variable':
      return applyRenameVariableCommand(document, command);
    case 'update-theme':
      return applyTheme(document, command.patch);
    case 'add-data-sources':
      return applyAddDataSourcesCommand(document, command.dataSources);
    case 'update-data-source-params':
      return applyUpdateDataSourceParamsCommand(document, command.dataSourceId, command.params);
    case 'add-variables':
      return applyAddVariablesCommand(document, command.variables);
    case 'remove-variables':
      return applyRemoveVariablesCommand(document, command.variableIds);
    case 'add-blueprint-elements':
      return applyAddBlueprintElementsCommand(document, command.nodes, command.edges);
    case 'remove-blueprint-elements':
      return applyRemoveBlueprintElementsCommand(document, command.nodeIds, command.edgeIds);
    default:
      return screenCommandFailure(
        document,
        invalidScreenCommand('Command type is not supported.', ['type']),
      );
  }
}

function applyCanvas(document: ScreenDocument, patch: unknown): ScreenCommandResult {
  if (!isExactPatch(patch, CANVAS_FIELDS)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Canvas patch contains an unknown or invalid field.', ['patch']),
    );
  }
  if (Object.keys(patch).length === 0) {
    return screenCommandSuccess(document, []);
  }
  // null 值表示删除字段（canvas 字段均不可空，无歧义）；其余值合并。
  const canvas = { ...document.canvas } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete canvas[key];
    } else {
      canvas[key] = value;
    }
  }
  if (screenJsonEquals(document.canvas, canvas)) {
    return screenCommandSuccess(document, []);
  }
  return finalizeScreenCommand(document, { ...document, canvas }, []);
}

function applyTheme(document: ScreenDocument, patch: unknown): ScreenCommandResult {
  if (!isRecord(patch)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Theme patch must be an object of slot colors.', ['patch']),
    );
  }
  for (const [key, value] of Object.entries(patch)) {
    if (
      !isScreenThemeSlot(key) ||
      typeof value !== 'string' ||
      value.trim() === '' ||
      value.length > 64
    ) {
      return screenCommandFailure(
        document,
        invalidScreenCommand('Theme patch keys must be palette slots with color strings.', [
          'patch',
          key,
        ]),
      );
    }
  }
  const palette = { ...document.theme?.palette, ...patch } as Record<string, string>;
  // 色板要么不存在、要么六个基础色位齐全：半套色板会让 theme: 引用解析到空洞。
  // 状态色位（ADR-0110 §2.6.4）可省略，省略时取内置默认色。
  if (SCREEN_THEME_BASE_SLOTS.some((slot) => typeof palette[slot] !== 'string')) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Theme patch must complete all palette slots.', ['patch']),
    );
  }
  const theme = { palette };
  if (screenJsonEquals(document.theme, theme)) return screenCommandSuccess(document, []);
  return finalizeScreenCommand(document, { ...document, theme }, []);
}

function applyVariables(document: ScreenDocument, variables: unknown): ScreenCommandResult {
  if (!Array.isArray(variables)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Variables must be an array.', ['variables']),
    );
  }
  if (screenJsonEquals(document.variables, variables)) {
    return screenCommandSuccess(document, []);
  }
  return finalizeScreenCommand(document, { ...document, variables }, []);
}

function applySubCanvases(
  document: ScreenDocument,
  subCanvases: unknown,
  startCanvasId: unknown,
): ScreenCommandResult {
  if (!Array.isArray(subCanvases)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Sub canvases must be an array.', ['subCanvases']),
    );
  }
  if (startCanvasId !== undefined && startCanvasId !== null && typeof startCanvasId !== 'string') {
    return screenCommandFailure(
      document,
      invalidScreenCommand('startCanvasId must be a string or null.', ['startCanvasId']),
    );
  }
  const next = { ...document } as { subCanvases?: unknown; startCanvasId?: unknown };
  if (subCanvases.length === 0) delete next.subCanvases;
  else next.subCanvases = subCanvases;
  if (startCanvasId === null) delete next.startCanvasId;
  else if (typeof startCanvasId === 'string') next.startCanvasId = startCanvasId;
  else if (
    // 缺省保持原值；原起始页已不是页面（被删 / 改为弹框）时随之去掉，免得整份文档校验失败。
    document.startCanvasId !== undefined &&
    !subCanvases.some(
      (canvas) =>
        isRecord(canvas) && canvas.id === document.startCanvasId && canvas.display === 'page',
    )
  ) {
    delete next.startCanvasId;
  }
  if (
    screenJsonEquals(document.subCanvases ?? [], subCanvases) &&
    next.startCanvasId === document.startCanvasId
  ) {
    return screenCommandSuccess(document, []);
  }
  return finalizeScreenCommand(document, next as ScreenDocument, []);
}

function applyBlueprint(document: ScreenDocument, blueprint: unknown): ScreenCommandResult {
  if (!isRecord(blueprint) || !Array.isArray(blueprint.nodes) || !Array.isArray(blueprint.edges)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Blueprint must be a canonical object.', ['blueprint']),
    );
  }
  if (screenJsonEquals(document.blueprint, blueprint)) return screenCommandSuccess(document, []);
  return finalizeScreenCommand(document, { ...document, blueprint }, []);
}

function getNetChangedComponentIds(
  before: ScreenDocument,
  after: ScreenDocument,
): readonly string[] {
  const afterById = new Map(after.components.map((component) => [component.id, component]));
  const beforeById = new Map(before.components.map((component) => [component.id, component]));
  // 命令路径结构共享：未变更组件在 before/after 中是同一引用（screenJsonEquals(x, x) 恒真）。
  // 先按引用短路，仅对引用变化（真正被命令改写）的少数组件做深比较，
  // 语义与全量深比较完全一致，成本从 O(n×fields) 降为 O(changed×fields)。
  const current = after.components
    .filter(
      (component) =>
        beforeById.get(component.id) !== component &&
        !screenJsonEquals(beforeById.get(component.id), component),
    )
    .map(({ id }) => id);
  const removed = before.components
    .filter((component) => !afterById.has(component.id))
    .map(({ id }) => id);
  // 实例结果变化时，读它的组件也必须重投影：值在「实例 + 取值引用」这条链上，
  // 而不是挂在组件上，因此「组件被 patch」不是唯一的重绘判据。
  const changed = new Set([...current, ...removed]);
  const affected = componentsReferencingDataSources(
    after,
    changedDataSourceIds(before.dataSources ?? [], after.dataSources ?? []),
  );
  const dependents = affected.filter((id) => !changed.has(id));
  return dependents.length === 0 ? [...changed] : [...changed, ...dependents];
}

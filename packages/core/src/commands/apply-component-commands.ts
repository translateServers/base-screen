import { type ScreenDocument, screenJsonEquals } from '@base-screen/contracts';
import {
  buildComponentIndex,
  getAncestorIds,
  getDescendantIds,
  isEffectiveLocked,
} from '../hierarchy/hierarchy.js';
import {
  canonicalTargetIds,
  isExactPatch,
  isRecord,
  isStatusOnlyPatch,
  isStringArray,
  patchDocument,
} from './command-input.js';
import {
  finalizeScreenCommand,
  invalidScreenCommand,
  screenCommandDiagnostic,
  screenCommandFailure,
  screenCommandSuccess,
} from './command-result.js';
import type { ScreenCommandResult } from './types.js';

const COMPONENT_PATCH_FIELDS = new Set([
  'name',
  'position',
  'size',
  'rotation',
  'zIndex',
  'status',
  'props',
  'style',
  'states',
  'dataSource',
  'dataValue',
  'dataBinding',
  'belowSubCanvas',
]);

export function applyAddComponentCommand(
  document: ScreenDocument,
  component: unknown,
): ScreenCommandResult {
  if (!isRecord(component)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Component must be an object.', ['component']),
    );
  }
  const index = buildComponentIndex(document);
  if (typeof component.id !== 'string') {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Component id must be a string.', ['component', 'id']),
    );
  }
  if (index.byId.has(component.id)) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_INVALID',
        ['component', 'id'],
        'Component id already exists.',
      ),
    );
  }
  if (component.parentId !== null && !index.byId.has(component.parentId as string)) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_PARENT_INVALID',
        ['component', 'parentId'],
        'Component parent does not exist.',
      ),
    );
  }
  if (component.parentId !== null && isEffectiveLocked(index, component.parentId as string)) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['component', 'parentId'],
        'Component parent is locked.',
      ),
    );
  }
  return finalizeScreenCommand(
    document,
    { ...document, components: [...document.components, component] },
    [component.id],
  );
}

export function applyUpdateComponentsCommand(
  document: ScreenDocument,
  componentIds: unknown,
  patch: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Component ids must be a string array.', ['componentIds']),
    );
  }
  if (!isExactPatch(patch, COMPONENT_PATCH_FIELDS) || Object.keys(patch).length === 0) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Component patch must contain known fields.', ['patch']),
    );
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) {
    return screenCommandSuccess(document, []);
  }
  const index = buildComponentIndex(document);
  const locked = targets.find((id) => isEffectiveLocked(index, id));
  if (locked !== undefined && !isStatusOnlyPatch(patch)) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['componentIds'],
        `Component "${locked}" is locked.`,
      ),
    );
  }
  const targetSet = new Set(targets);
  const components = document.components.map((component) => {
    if (!targetSet.has(component.id)) return component;
    const next = patchDocument(component, patch);
    // `dataValue: null` 表示清除取值引用；保留 null 键会被严格解析视为与 dataSource 并存。
    if ('dataValue' in patch && patch.dataValue === null) {
      delete (next as { dataValue?: unknown }).dataValue;
    }
    if ('belowSubCanvas' in patch && patch.belowSubCanvas === null) {
      delete (next as { belowSubCanvas?: unknown }).belowSubCanvas;
    }
    if ('states' in patch && patch.states === null) {
      delete (next as { states?: unknown }).states;
    }
    return next;
  });
  const changed = targets.filter((id) => {
    const entry = index.byId.get(id)!;
    return !screenJsonEquals(entry.component, components[entry.index]);
  });
  if (changed.length === 0) {
    return screenCommandSuccess(document, []);
  }
  return finalizeScreenCommand(document, { ...document, components }, changed);
}

export function applyRemoveComponentsCommand(
  document: ScreenDocument,
  componentIds: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds)) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Component ids must be a string array.', ['componentIds']),
    );
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) {
    return screenCommandSuccess(document, []);
  }
  const index = buildComponentIndex(document);
  const removed = new Set<string>();
  for (const target of targets) {
    removed.add(target);
    for (const descendant of getDescendantIds(index, target)) {
      removed.add(descendant);
    }
  }
  // 按文档序收集被移除组件（即后续 changed），锁检查只遍历该集合：
  // 首个命中与原先全量扫描的首个命中一致（诊断消息保持文档序）。
  const changed = document.components
    .filter((component) => removed.has(component.id))
    .map(({ id }) => id);
  const locked = changed.find((id) => isEffectiveLocked(index, id));
  if (locked !== undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['componentIds'],
        `Component "${locked}" is locked.`,
      ),
    );
  }
  return finalizeScreenCommand(
    document,
    {
      ...document,
      components: document.components.filter((component) => !removed.has(component.id)),
    },
    changed,
  );
}

export function applyReparentComponentsCommand(
  document: ScreenDocument,
  componentIds: unknown,
  parentId: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds) || (parentId !== null && typeof parentId !== 'string')) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Reparent command fields are invalid.', []),
    );
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) {
    return screenCommandSuccess(document, []);
  }
  const index = buildComponentIndex(document);
  // 判定「是否为另一 target 的后代」改走祖先链：id 的祖先命中 targets 即为内层，
  // 等价于原先对每个 target 展开 descendants 的 O(n²×d) 扫描，降为 O(n×depth)。
  const targetSet = new Set(targets);
  const outerTargets = targets.filter(
    (id) => !getAncestorIds(index, id).some((ancestor) => targetSet.has(ancestor)),
  );
  if (parentId !== null && !index.byId.has(parentId)) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_PARENT_INVALID',
        ['parentId'],
        'New parent does not exist.',
      ),
    );
  }
  const descendants = new Set<string>();
  for (const target of outerTargets) {
    descendants.add(target);
    for (const descendant of getDescendantIds(index, target)) {
      descendants.add(descendant);
    }
  }
  if (parentId !== null && descendants.has(parentId)) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_PARENT_INVALID',
        ['parentId'],
        'New parent cannot be a target or descendant.',
      ),
    );
  }
  const lockedTarget = outerTargets.find((id) => isEffectiveLocked(index, id));
  if (lockedTarget !== undefined || (parentId !== null && isEffectiveLocked(index, parentId))) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        [],
        'Reparenting crosses a locked component boundary.',
      ),
    );
  }
  const changed = outerTargets.filter((id) => index.byId.get(id)!.component.parentId !== parentId);
  if (changed.length === 0) {
    return screenCommandSuccess(document, []);
  }
  const changedSet = new Set(changed);
  return finalizeScreenCommand(
    document,
    {
      ...document,
      // 画布归属只写在根组件上（ADR-0109）：挂到某个父组件下时随之摘掉 `canvasId` / `belowSubCanvas`。
      components: document.components.map((component) => {
        if (!changedSet.has(component.id)) return component;
        if (parentId === null) return { ...component, parentId };
        const { canvasId: _canvasId, belowSubCanvas: _below, ...rest } = component;
        return { ...rest, parentId };
      }),
    },
    changed,
  );
}

/**
 * 跨画布移动根组件（ADR-0109 §2.2）。目标画布 `null` = 主画布；子组件随根组件，传子组件 id 失败关闭。
 * 移入弹框时把位置夹进面板（尺寸大于面板时贴左上角），坐标系差异由作者面另行提示。
 */
export function applyMoveComponentsCommand(
  document: ScreenDocument,
  componentIds: unknown,
  canvasId: unknown,
): ScreenCommandResult {
  if (!isStringArray(componentIds) || (canvasId !== null && typeof canvasId !== 'string')) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Move command fields are invalid.', []),
    );
  }
  const target =
    canvasId === null
      ? undefined
      : (document.subCanvases ?? []).find((candidate) => candidate.id === canvasId);
  if (canvasId !== null && target === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['canvasId'],
        'Target sub canvas does not exist.',
      ),
    );
  }
  const targets = canonicalTargetIds(document, componentIds);
  if (targets === undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_MISSING',
        ['componentIds'],
        'One or more components do not exist.',
      ),
    );
  }
  if (targets.length === 0) return screenCommandSuccess(document, []);
  const index = buildComponentIndex(document);
  const nonRoot = targets.find((id) => index.byId.get(id)!.component.parentId !== null);
  if (nonRoot !== undefined) {
    return screenCommandFailure(
      document,
      invalidScreenCommand('Only root components can move between canvases.', ['componentIds']),
    );
  }
  const locked = targets.find((id) => isEffectiveLocked(index, id));
  if (locked !== undefined) {
    return screenCommandFailure(
      document,
      screenCommandDiagnostic(
        'CORE_COMMAND_TARGET_LOCKED',
        ['componentIds'],
        `Component "${locked}" is locked.`,
      ),
    );
  }
  const targetSet = new Set(targets);
  const changed: string[] = [];
  const components = document.components.map((component) => {
    if (!targetSet.has(component.id)) return component;
    if ((component.canvasId ?? null) === canvasId) return component;
    const { canvasId: _canvasId, belowSubCanvas: _below, ...rest } = component;
    let next: typeof component =
      canvasId === null
        ? { ...rest, ...(component.belowSubCanvas === true ? { belowSubCanvas: true } : {}) }
        : { ...rest, canvasId };
    if (target?.display === 'popup') {
      const x = clamp(component.position.x, 0, Math.max(0, target.width - component.size.width));
      const y = clamp(component.position.y, 0, Math.max(0, target.height - component.size.height));
      if (x !== component.position.x || y !== component.position.y) {
        next = { ...next, position: { x, y } };
      }
    }
    changed.push(component.id);
    return next;
  });
  if (changed.length === 0) return screenCommandSuccess(document, []);
  return finalizeScreenCommand(document, { ...document, components }, changed);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

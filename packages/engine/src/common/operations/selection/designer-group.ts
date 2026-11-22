import type { ScreenComponentNode, ScreenDocument, ScreenSize } from '@base-screen/contracts';
import {
  applyScreenDocumentCommand,
  applyScreenDocumentTransaction,
  getScreenComponentBounds,
  getScreenSelectionBounds,
  isScreenComponentEffectivelyLocked,
  type ScreenDocumentCommand,
  type ScreenDocumentTransaction,
} from '@base-screen/core';
import {
  clampScreenCoordinate,
  clampScreenSize,
  roundScreenGeometry,
} from '../element/designer-geometry.js';

export function createGroupSizeTransaction(
  document: ScreenDocument,
  groupId: string,
  size: ScreenSize,
): ScreenDocumentTransaction | undefined {
  const group = document.components.find((component) => component.id === groupId);
  if (
    group === undefined ||
    isScreenComponentEffectivelyLocked(document, groupId) ||
    !isValidSize(size) ||
    group.size.width <= 0 ||
    group.size.height <= 0
  ) {
    return undefined;
  }
  const scaleX = size.width / group.size.width;
  const scaleY = size.height / group.size.height;
  const descendants = getDescendants(document, groupId);
  const anchor = group.position;
  const mutable = [group, ...descendants].filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
  const commands = mutable.map((component) => ({
    type: 'update-components' as const,
    componentIds: [component.id],
    patch: {
      position: {
        x: roundScreenGeometry(
          clampScreenCoordinate(anchor.x + (component.position.x - anchor.x) * scaleX),
        ),
        y: roundScreenGeometry(
          clampScreenCoordinate(anchor.y + (component.position.y - anchor.y) * scaleY),
        ),
      },
      size: {
        width: roundScreenGeometry(clampScreenSize(component.size.width * scaleX)),
        height: roundScreenGeometry(clampScreenSize(component.size.height * scaleY)),
      },
    },
  }));
  return commands.length === 0 ? undefined : { commands };
}

export function createGroupRotationTransaction(
  document: ScreenDocument,
  groupId: string,
  rotation: number,
): ScreenDocumentTransaction | undefined {
  const group = document.components.find((component) => component.id === groupId);
  if (
    group === undefined ||
    isScreenComponentEffectivelyLocked(document, groupId) ||
    !Number.isFinite(rotation) ||
    rotation < -180 ||
    rotation >= 180
  ) {
    return undefined;
  }
  const delta = rotation - group.rotation;
  if (delta === 0) return undefined;
  const mutable = [group, ...getDescendants(document, groupId)].filter(
    (component) => !isScreenComponentEffectivelyLocked(document, component.id),
  );
  const bounds = getScreenSelectionBounds(mutable);
  if (bounds === null) return undefined;
  const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    commands: mutable.map((component) => {
      const componentCenter = {
        x: component.position.x + component.size.width / 2,
        y: component.position.y + component.size.height / 2,
      };
      const offsetX = componentCenter.x - center.x;
      const offsetY = componentCenter.y - center.y;
      const nextCenter = {
        x: center.x + offsetX * cos - offsetY * sin,
        y: center.y + offsetX * sin + offsetY * cos,
      };
      return {
        type: 'update-components' as const,
        componentIds: [component.id],
        patch: {
          position: {
            x: roundScreenGeometry(clampScreenCoordinate(nextCenter.x - component.size.width / 2)),
            y: roundScreenGeometry(clampScreenCoordinate(nextCenter.y - component.size.height / 2)),
          },
          rotation:
            component.id === groupId ? rotation : normalizeRotation(component.rotation + delta),
        },
      };
    }),
  };
}

/**
 * 小于它的内边距视为「贴着子项」：几何经 `roundScreenGeometry` 取两位小数，吸附也会留零点几的误差。
 */
const GROUP_EDGE_TOLERANCE = 0.5;

type GroupSide = 'left' | 'top' | 'right' | 'bottom';
const GROUP_SIDES: readonly GroupSide[] = ['left', 'top', 'right', 'bottom'];

interface GroupEdges {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * 让已配置的组壳（`groupMaterialType`）在子项变化后仍包住子项。
 *
 * 逐条边决定跟随还是保持，依据是事务**之前**这条边与子项并集的距离：
 * - **贴着子项**（距离 ≤ 0.5 px）的边跟随子项：「成组」命令建出的组壳四边都贴着，因此仍然
 *   精确跟随子项移动、缩放、增删——与以前一致；
 * - **留有内边距**的边保持不动，只在子项越出时外扩：带内边距的卡片（组合分片的外壳、作者手搭的
 *   面板）不会再在一次无关编辑后被压平；
 * - 原本没有子项的容器四边都视为留有内边距：把组件放进一个空底座时底座保持原尺寸。
 *
 * 自适应宽度文本的渲染宽度变化不产生事务，组壳只能在下一次事务里顺带同步，这也是本函数对每个
 * 事务都运行的原因。这类文本的右边界在事务前就可能已经漂移，按距离判断会把漂移误当成内边距，
 * 所以**定义某条边的子项若在这条边上的投影位置不等于存储位置**（正在被渲染测量改写），
 * 这条边一律跟随。
 * 代价：一张卡片里最宽的子项若开启了自适应宽度，卡片右侧的内边距会被它吃掉。
 *
 * 同一事务里显式写了组壳几何的（缩放/旋转/插入组合）以该事务为准，不再派生。
 */
export function withDerivedDesignerGroupBounds(
  document: ScreenDocument,
  transaction: ScreenDocumentTransaction,
  groupMaterialType: string | undefined,
  projectGeometry?: (document: ScreenDocument) => ScreenDocument,
): ScreenDocumentTransaction {
  if (
    groupMaterialType === undefined ||
    document.components.every((component) => component.type !== groupMaterialType)
  ) {
    return transaction;
  }
  const projected = applyScreenDocumentTransaction(document, transaction);
  if (!projected.ok) return transaction;

  const explicitGeometry = new Set<string>();
  for (const command of transaction.commands) {
    if (command.type === 'add-component') {
      explicitGeometry.add(command.component.id);
    } else if (
      command.type === 'update-components' &&
      (command.patch.position !== undefined ||
        command.patch.size !== undefined ||
        command.patch.rotation !== undefined)
    ) {
      command.componentIds.forEach((componentId) => explicitGeometry.add(componentId));
    }
  }

  const before = document;
  const beforeGeometry = projectGeometry?.(before) ?? before;
  let current = projected.document;
  const commands: ScreenDocumentCommand[] = [];
  const groups = current.components
    .filter((component) => component.type === groupMaterialType)
    .sort((left, right) => componentDepth(current, right.id) - componentDepth(current, left.id));
  for (const group of groups) {
    if (explicitGeometry.has(group.id) || isScreenComponentEffectivelyLocked(current, group.id)) {
      continue;
    }
    const descendants = getDescendants(projectGeometry?.(current) ?? current, group.id);
    const bounds = getScreenSelectionBounds(descendants);
    if (bounds === null) continue;
    const following = followingGroupSides(before, beforeGeometry, group.id);
    const shell = edgesOf(group);
    const next: GroupEdges = {
      left: following.has('left') ? bounds.left : Math.min(shell.left, bounds.left),
      top: following.has('top') ? bounds.top : Math.min(shell.top, bounds.top),
      right: following.has('right') ? bounds.right : Math.max(shell.right, bounds.right),
      bottom: following.has('bottom') ? bounds.bottom : Math.max(shell.bottom, bounds.bottom),
    };
    const position = { x: next.left, y: next.top };
    const size = { width: next.right - next.left, height: next.bottom - next.top };
    if (samePosition(group.position, position) && sameSize(group.size, size)) continue;
    const command: ScreenDocumentCommand = {
      type: 'update-components',
      componentIds: [group.id],
      patch: { position, size },
    };
    const applied = applyScreenDocumentCommand(current, command);
    if (!applied.ok) continue;
    current = applied.document;
    commands.push(command);
  }
  return commands.length === 0 ? transaction : { commands: [...transaction.commands, ...commands] };
}

/**
 * 事务之前哪些边贴着子项（应当跟随）。组壳在事务前不存在时由调用方按显式几何跳过；
 * 事务前没有子项时返回空集（四边都保持）。
 */
function followingGroupSides(
  storedDocument: ScreenDocument,
  geometryDocument: ScreenDocument,
  groupId: string,
): ReadonlySet<GroupSide> {
  const following = new Set<GroupSide>();
  const shell = storedDocument.components.find((component) => component.id === groupId);
  if (shell === undefined) return following;
  const descendants = getDescendants(geometryDocument, groupId);
  const union = getScreenSelectionBounds(descendants);
  if (union === null) return following;
  const stored = new Map(
    getDescendants(storedDocument, groupId).map((component) => [component.id, component]),
  );
  const outer = edgesOf(shell);
  const inset: GroupEdges = {
    left: union.left - outer.left,
    top: union.top - outer.top,
    right: outer.right - union.right,
    bottom: outer.bottom - union.bottom,
  };
  for (const side of GROUP_SIDES) {
    if (inset[side] <= GROUP_EDGE_TOLERANCE) {
      following.add(side);
      continue;
    }
    // 定义这条边的子项在这条边上被渲染测量改写过（自适应宽度文本的右边界）：边界本身在漂移，
    // 不能据此判定内边距。只比较这一条边——自适应宽度不动左、上、下边，那三边照常判断。
    const drifting = descendants.some((component) => {
      const edge = getScreenComponentBounds(component)[side];
      if (Math.abs(edge - union[side]) > GROUP_EDGE_TOLERANCE) return false;
      const original = stored.get(component.id);
      return original !== undefined && getScreenComponentBounds(original)[side] !== edge;
    });
    if (drifting) following.add(side);
  }
  return following;
}

function edgesOf(component: ScreenComponentNode): GroupEdges {
  return {
    left: component.position.x,
    top: component.position.y,
    right: component.position.x + component.size.width,
    bottom: component.position.y + component.size.height,
  };
}

function getDescendants(
  document: ScreenDocument,
  componentId: string,
): readonly ScreenComponentNode[] {
  const childrenByParent = new Map<string | null, string[]>();
  const byId = new Map(document.components.map((component) => [component.id, component]));
  for (const component of document.components) {
    const children = childrenByParent.get(component.parentId) ?? [];
    children.push(component.id);
    childrenByParent.set(component.parentId, children);
  }
  const descendants: ScreenComponentNode[] = [];
  const pending = [...(childrenByParent.get(componentId) ?? [])];
  while (pending.length > 0) {
    const id = pending.shift()!;
    const component = byId.get(id);
    if (component === undefined) continue;
    descendants.push(component);
    pending.push(...(childrenByParent.get(id) ?? []));
  }
  return descendants;
}

function componentDepth(document: ScreenDocument, componentId: string): number {
  const byId = new Map(document.components.map((component) => [component.id, component]));
  let depth = 0;
  let parentId = byId.get(componentId)?.parentId ?? null;
  while (parentId !== null) {
    depth++;
    parentId = byId.get(parentId)?.parentId ?? null;
  }
  return depth;
}

function isValidSize(size: ScreenSize): boolean {
  return (
    Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0
  );
}

function samePosition(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): boolean {
  return left.x === right.x && left.y === right.y;
}

function sameSize(left: ScreenSize, right: ScreenSize): boolean {
  return left.width === right.width && left.height === right.height;
}

function normalizeRotation(rotation: number): number {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

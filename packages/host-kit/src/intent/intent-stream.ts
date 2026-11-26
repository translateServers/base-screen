import type { IntentCatalog } from './intent-catalog.js';
import type {
  IntentSkeleton,
  IntentSkeletonRegion,
  IntentSkeletonSlot,
  IntentStreamFrame,
} from './intent-compile-types.js';
import { flatSkeleton } from './intent-compile-types.js';
import { clampText, parseIntentBlock, parseIntentKpi } from './intent-parse.js';
import type { IntentBlock, IntentKpi, ScreenIntent } from './intent-types.js';

/**
 * 流式落稿的宿主侧装配（ADR-0113 §2.8）。
 *
 * 后端只做增量扫描：骨架写完推 `skeleton`，之后每写完一个指标或块推一条 `item`。这里把它们接成
 * 编译器吃的 `ScreenIntent` + `IntentStreamFrame`——宿主每收到一条事件，就用 `frame()` 编一帧。
 * 骨架一经接受就不再变（几何从第一帧起不变）；内容逐项解析，坏的那一格留着占位，由最终结果的
 * 整份解析与修复回环去处理。
 */

const MAX_REGIONS = 6;
const MAX_ITEMS = 8;
const FLAT_MAX_KPIS = 5;
const FLAT_MAX_BLOCKS = 4;
const SPLIT_RATIOS = new Set(['wide-narrow', 'even']);
const RAIL_SIDES = new Set(['left', 'right']);

/**
 * 模型给的骨架：区域写法 `{ regions: [...] }` 或平铺写法 `{ kpis: n, blocks: [{ type, span }] }`。
 * 骨架里的 `type` 必须在目录里（数据型与否由物料声明决定）；任何一处不合法就整份不接受，
 * 返回 undefined——此时不推任何帧，等整份输出写完走常规路径。
 */
export function parseIntentSkeleton(
  raw: unknown,
  catalog: IntentCatalog,
): IntentSkeleton | undefined {
  const layout = asRecord(raw);
  if (layout === null) return undefined;

  if (Array.isArray(layout.regions)) {
    if (layout.regions.length < 1 || layout.regions.length > MAX_REGIONS) return undefined;
    const regions: IntentSkeletonRegion[] = [];
    for (const item of layout.regions) {
      const region = readRegion(item, catalog);
      if (region === undefined) return undefined;
      regions.push(region);
    }
    return { regions };
  }

  const kpis = layout.kpis;
  if (typeof kpis !== 'number' || !Number.isInteger(kpis) || kpis < 1 || kpis > FLAT_MAX_KPIS) {
    return undefined;
  }
  const blocks = readSlots(layout.blocks, catalog, FLAT_MAX_BLOCKS);
  return blocks === undefined ? undefined : flatSkeleton(kpis, blocks);
}

function readRegion(raw: unknown, catalog: IntentCatalog): IntentSkeletonRegion | undefined {
  const region = asRecord(raw);
  if (region === null) return undefined;
  if (region.kind === 'band') {
    const count = region.count;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > MAX_ITEMS) {
      return undefined;
    }
    return { kind: 'band', count };
  }
  if (region.kind === 'grid') {
    const slots = readSlots(region.blocks ?? region.slots, catalog, MAX_ITEMS);
    return slots === undefined ? undefined : { kind: 'grid', slots };
  }
  if (region.kind === 'split') {
    const ratio = region.ratio === undefined ? 'wide-narrow' : region.ratio;
    const railSide = region.railSide === undefined ? 'right' : region.railSide;
    if (typeof ratio !== 'string' || !SPLIT_RATIOS.has(ratio)) return undefined;
    if (typeof railSide !== 'string' || !RAIL_SIDES.has(railSide)) return undefined;
    const main = readSlots(region.main, catalog, MAX_ITEMS);
    const rail = readSlots(region.rail, catalog, MAX_ITEMS);
    if (main === undefined || rail === undefined) return undefined;
    return {
      kind: 'split',
      ratio: ratio as 'wide-narrow' | 'even',
      railSide: railSide as 'left' | 'right',
      main: main.map((slot) => ({ data: slot.data })),
      rail: rail.map((slot) => ({ data: slot.data })),
    };
  }
  return undefined;
}

function readSlots(
  raw: unknown,
  catalog: IntentCatalog,
  max: number,
): IntentSkeletonSlot[] | undefined {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > max) return undefined;
  const slots: IntentSkeletonSlot[] = [];
  for (const item of raw) {
    const slot = asRecord(item);
    const type = typeof slot?.type === 'string' ? slot.type.trim() : '';
    const material = catalog.materials.find((candidate) => candidate.type === type);
    if (slot === null || material === undefined || material.children === true) return undefined;
    // `span` 缺省为 1：侧栏与主区里的块不排栅格，模型可以不写。
    const span = slot.span === undefined ? 1 : slot.span;
    if (typeof span !== 'number' || !Number.isFinite(span)) return undefined;
    slots.push({
      span: Math.min(4, Math.max(1, Math.round(span))),
      data: material.data === 'tabular',
    });
  }
  return slots;
}

export interface IntentStreamHead {
  readonly title: string;
  readonly subtitle: string;
  readonly style?: string;
  readonly layout: unknown;
}

export interface IntentStreamAssembler {
  /** 骨架：标题、副标题、风格与版面。接受返回 true；已经接受过或不合法返回 false。 */
  skeleton(head: IntentStreamHead): boolean;
  /** 一个写完的指标或块；`path` 是模型原文里的位置路径。内容有变化返回 true。 */
  item(path: string, value: unknown): boolean;
  /** 当前一帧的编译输入；骨架还没到时为 undefined。 */
  frame(): { readonly intent: ScreenIntent; readonly stream: IntentStreamFrame } | undefined;
}

export function createIntentStreamAssembler(catalog: IntentCatalog): IntentStreamAssembler {
  let head: IntentStreamHead | undefined;
  let skeleton: IntentSkeleton | undefined;
  const kpis: Record<string, IntentKpi> = {};
  const blocks: Record<string, IntentBlock> = {};
  const slotPaths = { kpis: new Set<string>(), blocks: new Set<string>() };
  const gridPaths = new Set<string>();

  const register = (value: IntentSkeleton): void => {
    for (const [position, region] of value.regions.entries()) {
      const path =
        value.flat === true ? (region.kind === 'band' ? 'kpis' : 'blocks') : `regions[${position}]`;
      const at = (part: string, index: number) =>
        value.flat === true ? `${path}[${index}]` : `${path}.${part}[${index}]`;
      if (region.kind === 'band') {
        for (let i = 0; i < region.count; i += 1) slotPaths.kpis.add(at('items', i));
      } else if (region.kind === 'grid') {
        for (let i = 0; i < region.slots.length; i += 1) {
          slotPaths.blocks.add(at('blocks', i));
          gridPaths.add(at('blocks', i));
        }
      } else {
        for (let i = 0; i < region.main.length; i += 1) slotPaths.blocks.add(at('main', i));
        for (let i = 0; i < region.rail.length; i += 1) slotPaths.blocks.add(at('rail', i));
      }
    }
  };

  return {
    skeleton(input) {
      if (head !== undefined) return false;
      const parsed = parseIntentSkeleton(input.layout, catalog);
      if (parsed === undefined || input.title.trim() === '' || input.subtitle.trim() === '') {
        return false;
      }
      head = input;
      skeleton = parsed;
      register(parsed);
      return true;
    },
    item(path, value) {
      if (skeleton === undefined) return false;
      if (slotPaths.kpis.has(path)) {
        const parsed = parseIntentKpi(value, path);
        if (parsed.value === undefined || path in kpis) return false;
        kpis[path] = parsed.value;
        return true;
      }
      if (slotPaths.blocks.has(path)) {
        const parsed = parseIntentBlock(value, catalog, path, { grid: gridPaths.has(path) });
        if (parsed.value === undefined || path in blocks) return false;
        blocks[path] = parsed.value;
        return true;
      }
      return false;
    },
    frame() {
      if (head === undefined || skeleton === undefined) return undefined;
      return {
        intent: {
          title: clampText(head.title.trim(), 20),
          subtitle: clampText(head.subtitle.trim(), 40),
          ...(head.style === undefined || head.style === '' ? {} : { style: head.style }),
          regions: [],
        },
        stream: { skeleton, kpis: { ...kpis }, blocks: { ...blocks } },
      };
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

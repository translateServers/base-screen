import {
  type DesignerKeyboardEventShape,
  designerChordFromKeyboardEvent,
} from './designer-key-chords.js';

// 键盘策略裁决结果：允许 / 阻止默认 / 执行应用命令。
export type DesignerKeyboardPolicy =
  | { readonly kind: 'allow' }
  | { readonly kind: 'block' }
  | { readonly kind: 'command'; readonly chord: string };

export interface DesignerKeyboardPolicyContext {
  readonly editable: boolean;
  readonly gestureActive: boolean;
  /** 设计器表面存在非折叠的文本选区（面板/只读文本被用户选中）。 */
  readonly textSelection: boolean;
}

export interface DesignerOperationChordInfo {
  readonly repeatable?: boolean;
}

function blockChords(chords: readonly string[]): Set<string> {
  return new Set(chords.map(normalizeDesignerChord));
}

function normalizeDesignerChord(chord: string): string {
  return chord.replace('Cmd', 'Ctrl').toUpperCase();
}

// 全目标无条件黑名单：无应用命令、无原生文本语义（macOS Cocoa 未占用），永远阻止浏览器默认。
const UNCONDITIONAL_ALL_BLOCK = blockChords(['F5', 'Ctrl+R', 'Alt']);

// 全目标条件黑名单：先走命令通道，命令未执行（未注册/不可用/未启用）时也阻止浏览器默认。
// 浏览器缩放组合（Ctrl+0/=/±）与保存网页（Ctrl+S）在可编辑目标上同样被阻止。
const CONDITIONAL_ALL_BLOCK = blockChords([
  'Ctrl+S',
  'Ctrl+0',
  'Ctrl+=',
  'Ctrl+Shift+=',
  'Ctrl+Shift++',
  'Ctrl+-',
]);

// 非可编辑目标无条件黑名单：macOS Cocoa 文本编辑占用了 Ctrl+W/T/N（删词/换位/下一行）
// 与 Option+←/→（词跳转），因此这些组合绝不能触碰可编辑目标。
const UNCONDITIONAL_NON_EDITABLE_BLOCK = blockChords([
  'Ctrl+W',
  'Ctrl+T',
  'Ctrl+N',
  'Ctrl+P',
  'Ctrl+J',
  'Alt+ArrowLeft',
  'Alt+ArrowRight',
]);

// 非可编辑目标条件黑名单：应用命令未执行时阻止浏览器默认（收藏/历史/地址栏/查找）。
const CONDITIONAL_NON_EDITABLE_BLOCK = blockChords([
  'Ctrl+D',
  'Ctrl+H',
  'Ctrl+K',
  'Ctrl+L',
  'Ctrl+F',
]);

// Firefox 快速查找：非可编辑目标上的 / 与 ' 会进入浏览器内查找。
const QUICK_FIND_KEYS = new Set(['/', "'"]);

// 非可编辑目标上的原生文本语义 chord：只有存在真实文本选区时才归浏览器。
const NATIVE_TEXT_SELECTION_CHORDS = blockChords(['Ctrl+C']);

/**
 * 键盘事件策略裁决（三态）：
 *
 * 1. 手势激活 → 全吞（block）；
 * 2. IME 组合期 / AltGr → 放行，不路由任何命令；
 * 3. 全目标无条件黑名单 → block；
 * 4. 可编辑目标 → 只受全目标条件黑名单约束（如 Ctrl+S 不弹保存网页、Ctrl+0/=/- 不触发
 *    浏览器缩放），其余一律放行原生文本编辑（含 macOS Cocoa 组合与原生 Ctrl+Z/C/V）；
 * 5. 非可编辑目标上已存在文本选区且 chord 属原生文本语义（Ctrl+C）→ 放行，不让"复制
 *    选中组件"抢占用户刚选中的面板/只读文本；
 * 6. 命中注册操作 → 按 repeat 分类裁决 command / block；
 * 7. 全目标条件黑名单 → block（命令未执行的补位）；
 * 8. 非可编辑目标无条件/条件黑名单与快速查找 → block。
 */
export function resolveDesignerKeyboardPolicy(
  event: DesignerKeyboardEventShape,
  context: DesignerKeyboardPolicyContext,
  findOperation: (chord: string) => DesignerOperationChordInfo | undefined,
): DesignerKeyboardPolicy {
  if (context.gestureActive) return { kind: 'block' };
  if (event.isComposing === true || event.key === 'Process' || event.altGraph === true) {
    return { kind: 'allow' };
  }
  const chord = designerChordFromKeyboardEvent(event);
  if (chord === undefined) return { kind: 'allow' };
  const normalized = normalizeDesignerChord(chord);
  if (UNCONDITIONAL_ALL_BLOCK.has(normalized)) return { kind: 'block' };
  if (context.editable) {
    if (CONDITIONAL_ALL_BLOCK.has(normalized)) return { kind: 'block' };
    return { kind: 'allow' };
  }
  if (context.textSelection && NATIVE_TEXT_SELECTION_CHORDS.has(normalized)) {
    return { kind: 'allow' };
  }
  const operation = findOperation(chord);
  if (operation !== undefined) {
    if (event.repeat === true && operation.repeatable !== true) return { kind: 'block' };
    return { kind: 'command', chord };
  }
  if (CONDITIONAL_ALL_BLOCK.has(normalized)) return { kind: 'block' };
  if (UNCONDITIONAL_NON_EDITABLE_BLOCK.has(normalized)) return { kind: 'block' };
  if (CONDITIONAL_NON_EDITABLE_BLOCK.has(normalized)) return { kind: 'block' };
  if (QUICK_FIND_KEYS.has(event.key)) return { kind: 'block' };
  return { kind: 'allow' };
}

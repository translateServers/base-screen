// 键盘事件的结构形状：common/ 保持环境无关（无 DOM KeyboardEvent）。
export interface DesignerKeyboardEventShape {
  readonly altGraph?: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing?: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly repeat?: boolean;
  readonly shiftKey: boolean;
}

// chord 规范化 v2：从键盘事件提取统一快捷键串（与操作注册表元数据同构）。
// - Backspace 归一为 Delete（与注册表语义一致）；
// - Cmd 归一为 Ctrl（macOS 与 Windows 共用同一命令元数据）；
// - IME 组合期（isComposing / Process 键）与 AltGr 布局不产生命令 chord，
//   由上层裁决为"放行"，避免中文输入法与欧式键盘布局误触发快捷键。
export function designerChordFromKeyboardEvent(
  event: DesignerKeyboardEventShape,
): string | undefined {
  if (event.isComposing === true || event.key === 'Process' || event.altGraph === true) {
    return undefined;
  }
  if (event.key === 'Backspace') return 'Delete';
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  const modifiers = [
    event.ctrlKey || event.metaKey ? 'Ctrl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : '',
  ]
    .filter(Boolean)
    .join('+');
  return `${modifiers}${modifiers === '' ? '' : '+'}${key}`;
}

export type DesignerOperationScope = 'global' | 'canvas' | 'layers' | 'inspector' | 'blueprint';

export interface DesignerOperationDefinition<Context> {
  readonly id: string;
  readonly scope: DesignerOperationScope;
  readonly label: string;
  readonly tooltip: string;
  readonly shortcut?: string;
  readonly aliases?: readonly string[];
  readonly isAvailable: (context: Context) => boolean;
  readonly isEnabled: (context: Context) => boolean;
  readonly execute: (context: Context) => void | Promise<void>;
}

export interface DesignerOperationState<Context> {
  readonly definition: DesignerOperationDefinition<Context>;
  readonly available: boolean;
  readonly enabled: boolean;
}

export class DesignerOperationRegistry<Context> {
  readonly #definitions: ReadonlyMap<string, DesignerOperationDefinition<Context>>;

  constructor(definitions: readonly DesignerOperationDefinition<Context>[]) {
    const entries = definitions.map((definition) => [definition.id, definition] as const);
    this.#definitions = new Map(entries);
    if (this.#definitions.size !== definitions.length) {
      throw new Error('Designer operation ids must be unique.');
    }
  }

  get(id: string): DesignerOperationDefinition<Context> | undefined {
    return this.#definitions.get(id);
  }

  getState(id: string, context: Context): DesignerOperationState<Context> | undefined {
    const definition = this.#definitions.get(id);
    if (definition === undefined) return undefined;
    const available = definition.isAvailable(context);
    return {
      definition,
      available,
      enabled: available && definition.isEnabled(context),
    };
  }

  execute(id: string, context: Context): boolean {
    const state = this.getState(id, context);
    if (state === undefined || !state.enabled) return false;
    void state.definition.execute(context);
    return true;
  }

  findByShortcut(shortcut: string): DesignerOperationDefinition<Context> | undefined {
    const normalized = normalizeDesignerShortcut(shortcut);
    return [...this.#definitions.values()].find((definition) =>
      [definition.shortcut, ...(definition.aliases ?? [])].some(
        (candidate) =>
          candidate !== undefined && normalizeDesignerShortcut(candidate) === normalized,
      ),
    );
  }
}

// Structural keyboard-shape so common/ stays environment-agnostic (no DOM KeyboardEvent).
export interface DesignerKeyboardEventShape {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly key: string;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

export function shortcutFromKeyboardEvent(event: DesignerKeyboardEventShape): string | undefined {
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

function normalizeDesignerShortcut(shortcut: string): string {
  return shortcut.replace('Cmd', 'Ctrl').toUpperCase();
}

export const DESIGNER_OPERATION_TEXT = {
  undo: { label: '撤销', tooltip: '撤销上一步操作', shortcut: 'Ctrl+Z' },
  redo: { label: '重做', tooltip: '重做上一步操作', shortcut: 'Ctrl+Shift+Z' },
  'select-all': { label: '全选', tooltip: '选择全部组件', shortcut: 'Ctrl+A' },
  delete: { label: '删除', tooltip: '删除选中组件', shortcut: 'Delete' },
  escape: { label: '取消', tooltip: '取消当前操作', shortcut: 'Escape' },
  'nudge-left': { label: '左移', tooltip: '向左微调', shortcut: 'ArrowLeft' },
  'nudge-right': { label: '右移', tooltip: '向右微调', shortcut: 'ArrowRight' },
  'nudge-up': { label: '上移', tooltip: '向上微调', shortcut: 'ArrowUp' },
  'nudge-down': { label: '下移', tooltip: '向下微调', shortcut: 'ArrowDown' },
  copy: { label: '复制', tooltip: '复制选中组件', shortcut: 'Ctrl+C' },
  paste: { label: '粘贴', tooltip: '粘贴组件', shortcut: 'Ctrl+V' },
  duplicate: { label: '原地复制', tooltip: '原地复制选中组件', shortcut: 'Ctrl+D' },
  group: { label: '编组', tooltip: '将选中组件编组', shortcut: 'Ctrl+G' },
  ungroup: { label: '取消编组', tooltip: '取消选中组件的编组', shortcut: 'Ctrl+Shift+G' },
  lock: { label: '锁定', tooltip: '锁定选中组件', shortcut: 'Ctrl+L' },
  unlock: { label: '解锁', tooltip: '解锁选中组件', shortcut: 'Ctrl+Shift+L' },
  hide: { label: '隐藏', tooltip: '隐藏选中组件', shortcut: 'Ctrl+H' },
  'bring-to-front': { label: '置顶', tooltip: '将选中组件移到最前', shortcut: 'Ctrl+]' },
  'send-to-back': { label: '置底', tooltip: '将选中组件移到最后', shortcut: 'Ctrl+[' },
  'align-left': { label: '左对齐', tooltip: '将选中组件左对齐', shortcut: 'Ctrl+Alt+L' },
  'align-center': { label: '水平居中', tooltip: '将选中组件水平居中', shortcut: 'Ctrl+Alt+C' },
  'align-right': { label: '右对齐', tooltip: '将选中组件右对齐', shortcut: 'Ctrl+Alt+R' },
  'align-top': { label: '顶端对齐', tooltip: '将选中组件顶端对齐', shortcut: 'Ctrl+Alt+T' },
  'align-middle': { label: '垂直居中', tooltip: '将选中组件垂直居中', shortcut: 'Ctrl+Alt+M' },
  'align-bottom': { label: '底端对齐', tooltip: '将选中组件底端对齐', shortcut: 'Ctrl+Alt+B' },
  'distribute-horizontal': {
    label: '水平分布',
    tooltip: '将选中组件水平分布',
    shortcut: 'Ctrl+Alt+H',
  },
  'distribute-vertical': {
    label: '垂直分布',
    tooltip: '将选中组件垂直分布',
    shortcut: 'Ctrl+Alt+V',
  },
  'zoom-in': { label: '放大', tooltip: '放大画布', shortcut: 'Ctrl+=' },
  'zoom-out': { label: '缩小', tooltip: '缩小画布', shortcut: 'Ctrl+-' },
  'zoom-reset': { label: '重置缩放', tooltip: '重置画布缩放' },
  'zoom-fit': { label: '适应画布', tooltip: '适应画布大小', shortcut: 'Ctrl+0' },
  preview: { label: '预览', tooltip: '预览直接文档' },
  'project-workspace': { label: '项目', tooltip: '打开项目面板' },
  import: { label: '导入', tooltip: '导入规范文档' },
  export: { label: '导出', tooltip: '导出规范文档' },
  'project-save': { label: '保存', tooltip: '保存项目', shortcut: 'Ctrl+S' },
  'project-publish': { label: '发布', tooltip: '发布项目' },
  'project-retry': { label: '重试', tooltip: '重试项目操作' },
  'project-cancel': { label: '取消', tooltip: '取消项目操作' },
  'toggle-grid': { label: '网格', tooltip: '切换网格' },
  'toggle-snap': { label: '对齐', tooltip: '切换网格对齐' },
  'toggle-guides': { label: '参考线', tooltip: '切换参考线显示', shortcut: 'Ctrl+;' },
  'toggle-border-guides': { label: '边框参考线', tooltip: '切换边框参考线', shortcut: 'Ctrl+K' },
  'toggle-workbench': { label: '切换工作台模式', tooltip: '切换工作台模式', shortcut: 'F' },
  'show-help': { label: '快捷键帮助', tooltip: '显示快捷键帮助', shortcut: 'Ctrl+/' },
  'nudge-10-left': { label: '左移 10px', tooltip: '向左微调 10px', shortcut: 'Shift+ArrowLeft' },
  'nudge-10-right': { label: '右移 10px', tooltip: '向右微调 10px', shortcut: 'Shift+ArrowRight' },
  'nudge-10-up': { label: '上移 10px', tooltip: '向上微调 10px', shortcut: 'Shift+ArrowUp' },
  'nudge-10-down': { label: '下移 10px', tooltip: '向下微调 10px', shortcut: 'Shift+ArrowDown' },
} as const;

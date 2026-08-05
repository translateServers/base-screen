export type DesignerOperationScope = 'global' | 'canvas' | 'layers' | 'inspector' | 'blueprint';

export interface DesignerOperationDefinition<Context> {
  readonly id: string;
  readonly scope: DesignerOperationScope;
  readonly label: string;
  readonly tooltip: string;
  readonly shortcut?: string;
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
}

export const DESIGNER_OPERATION_TEXT = {
  undo: { label: '撤销', tooltip: '撤销上一步操作' },
  redo: { label: '重做', tooltip: '重做上一步操作' },
  copy: { label: '复制', tooltip: '复制选中组件' },
  paste: { label: '粘贴', tooltip: '粘贴组件' },
  group: { label: '编组', tooltip: '将选中组件编组' },
  ungroup: { label: '取消编组', tooltip: '取消选中组件的编组' },
  'align-left': { label: '左对齐', tooltip: '将选中组件左对齐' },
  'align-center': { label: '水平居中', tooltip: '将选中组件水平居中' },
  'align-right': { label: '右对齐', tooltip: '将选中组件右对齐' },
  'align-top': { label: '顶端对齐', tooltip: '将选中组件顶端对齐' },
  'align-middle': { label: '垂直居中', tooltip: '将选中组件垂直居中' },
  'align-bottom': { label: '底端对齐', tooltip: '将选中组件底端对齐' },
  'distribute-horizontal': { label: '水平分布', tooltip: '将选中组件水平分布' },
  'distribute-vertical': { label: '垂直分布', tooltip: '将选中组件垂直分布' },
  'zoom-in': { label: '放大', tooltip: '放大画布' },
  'zoom-out': { label: '缩小', tooltip: '缩小画布' },
  'zoom-reset': { label: '重置缩放', tooltip: '重置画布缩放' },
  'zoom-fit': { label: '适应画布', tooltip: '适应画布大小' },
  preview: { label: '预览', tooltip: '预览直接文档' },
  import: { label: '导入', tooltip: '导入规范文档' },
  export: { label: '导出', tooltip: '导出规范文档' },
  'project-save': { label: '保存', tooltip: '保存项目' },
  'project-publish': { label: '发布', tooltip: '发布项目' },
  'project-retry': { label: '重试', tooltip: '重试项目操作' },
  'project-cancel': { label: '取消', tooltip: '取消项目操作' },
  'toggle-grid': { label: '网格', tooltip: '切换网格' },
  'toggle-snap': { label: '对齐', tooltip: '切换网格对齐' },
} as const;

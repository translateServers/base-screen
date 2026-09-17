# 接入 Blueprint 工作台与宿主高级编辑器

> 返回[宿主使用指南](../usage.md)。


Blueprint 使用 Designer 内的一体化工作台：Base Screen 渲染全局顶部栏、左右语义面板和底部状态，宿主通过
固定 slot 提供中央图形画布。Blueprint 编辑直接进入当前 `ScreenDocument` 和统一历史，没有“应用蓝图”或
“取消草稿”。代码、完整图表库 option 配置和其它领域编辑器仍由宿主在 Shadow DOM 之外提供。

宿主应在 `configure()` / `load()` 前把一个中央画布元素放入 Designer light DOM：

```ts
import {
  BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT,
  BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT,
  BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT,
  type BaseScreenBlueprintCanvasCommandEventDetail,
  type BaseScreenBlueprintCanvasStateEventDetail,
} from '@base-screen/sdk';

const canvas = document.createElement('xj-blueprint-canvas');
canvas.slot = BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT;
designer.append(canvas);

canvas.addEventListener(BASE_SCREEN_BLUEPRINT_CANVAS_STATE_EVENT, (event) => {
  const { state } = (event as CustomEvent<BaseScreenBlueprintCanvasStateEventDetail>).detail;
  renderGraph(state.graph, { active: state.active, selection: state.selection });
});

function selectNode(id: string, state: BaseScreenBlueprintCanvasStateEventDetail['state']) {
  const detail: BaseScreenBlueprintCanvasCommandEventDetail = {
    command: {
      type: 'select',
      commandId: crypto.randomUUID(),
      generation: state.generation,
      documentRevision: state.documentRevision,
      selection: { kind: 'node', id },
    },
  };
  canvas.dispatchEvent(new CustomEvent(BASE_SCREEN_BLUEPRINT_CANVAS_COMMAND_EVENT, {
    bubbles: true,
    composed: true,
    detail,
  }));
}
```

状态快照是冻结、JSON-safe 的权威投影，包含 generation、document revision、active、graph、selection、
diagnostics、trace、view request 和最近命令结果。宿主不得修改它，也不得把 callback、Vue component、服务对象
或 Engine 私有引用送回。命令严格覆盖 ready、select、connect、delete-selection、insert-node、commit-layout、
commit-viewport、history-undo、history-redo 和 run-simulation；每条命令必须复用最新 generation/revision 并使用
唯一 command id。未知字段、越界值、重复或过期命令均失败关闭，随后会收到新的权威状态。

已连接的 `set-variable` 动作在右侧配置中可选 JSON 固定值、完整触发事件、触发物料
Manifest `editorDescriptor.events[].payloadSchema` 声明的字段路径，或其他全局变量。
这些选项分别写入现有 `literal` / `event-payload` / `variable` 表达式；不接受 JavaScript、
表达式字符串或未声明事件路径。`array`/`object` 表达式继续可解析和运行，本批不提供
新的复合表达式作者控件。

模式可由用户页签或公开 API 切换：

```ts
designer.configure({
  catalog,
  initialWorkbenchMode: 'canvas',
  projectAdapter,
});

designer.setWorkbenchMode('blueprint', {
  focus: { kind: 'component', id: 'chart-1' },
});

console.log(designer.workbenchMode); // 'blueprint'
```

slot 不存在时 Blueprint 页签禁用；活动期间 slot 被移除时 Designer 原子回退 Canvas，并以
`base-screen-designer-workbench-mode-change` 的 `fallback` reason 和诊断通知宿主。宿主应保持中央元素挂载，按
state.active 暂停交互，并在 false → true 时重新测量 Vue Flow 等图形画布。节点拖动、缩放和自动布局只在手势
结束时提交，避免逐帧事务。

组件文本编辑协议保持不变：`requestComponentTextEdit()`、`commitComponentTextEdit()` 与
`base-screen-authoring-request` 继续校验 component identity、revision 和目标 schema。宿主不要访问 Designer
Shadow DOM、内部 Store 或 `src` 路径；Vue Flow、Dagre 等中央图形依赖也不应加入 Base Screen workspace。

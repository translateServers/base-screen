# ADR-0081: 事件与 Blueprint 作者面归属

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0026、ADR-0028、ADR-0061、ADR-0063（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md)、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)、[ADR-0018](./ADR-0018-host-intents-assets-and-graph-blueprint.md)、[ADR-0019](./ADR-0019-designer-specialized-editor-dependencies.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、ADR-0062、ADR-0073

## 背景

Event Blueprint 的 canonical 语义是「物料事件 → 可选条件 → 有序动作」，Core 已提供编译、只读 trace 与 `replace-blueprint` 单事务。争议从来不在语义，而在**作者面归谁、以什么形态承载**。这条主线经历了连续反转，每次反转都保留上一阶段的 canonical 契约与运行时能力，只调整作者面与工作台形态：

1. **ADR-0026** 整体延后图形路径。仓库外候选评估结论：X6 栈（`@antv/x6` + selection/minimap）17/17 case 通过但消费者 gzip 增量约 135.4 KiB，超出 ADR-0019 的 40 KiB 默认预算约 3.4 倍，且有插件线发布损坏与死代码；Rete 声明 postinstall 违反硬门禁且相对零依赖原生方案无新增能力。用户决策为「图形整体延后」，本期以键盘表单为唯一作者路径，新增生产依赖为零。
2. **ADR-0028** 建立 JSON-safe 的 `editorDescriptor` 与宿主作者桥，把 Engine 内部表单作者 UI 范围移交宿主；宿主可自行实现表单或图形 Blueprint 编辑器，只提交 canonical Blueprint。ADR-0026 的 canonical 契约、compile/trace/replace command、history、revision guard 与诊断继续有效并保持单一事实来源。
3. **ADR-0061** 沿该授权把 Blueprint 投影为受限可视流程，作者入口定为**当前 `ScreenDocument` 的整屏 detached 宿主桥**：请求携带 detached 文档上下文与在用物料事件投影，不以当前组件定义编辑范围；Engine 内建界面只保留顶栏宿主入口与组件只读事件/规则摘要。
4. **ADR-0063** 反转该形态。XJ 落地证明 Vue Flow、Dagre 与图形手势确实应留在宿主，但独立标题栏、草稿历史、应用/取消与 Designer 历史形成了两套工作台与两套编辑状态，模式切换还会卸载 Designer。改为 Base Screen 拥有一体化工作台壳层与语义编辑，宿主只提供中央图形渲染；它取代 ADR-0061 的决策 4、5、7、8 以及「图布局不进入文档」的表述。

现行结论即第 4 步形态。

## 决策

### 1. canonical Blueprint 与 Core 能力保持单一事实来源

canonical shape 固定为 `material-event` trigger、至多一个紧随 trigger 的 condition 和有序 `set-variable`、`emit-host-event`、`host-action` actions；不增加 delay、comment、layout、兼容字段、执行脚本或新的 action 入口，`host-action.actionId` 保持只读。`@base-screen/core` 的 `traceScreenBlueprintEvent(plan, state, event)` 与 `dispatchScreenBlueprintEvent` 共用同一无宿主求值内核：trace 只返回 detached JSON 与诊断，不接受也不调用宿主端口，dispatch 输出与 trace 内嵌的 dispatch 输出逐字段等价。应用经 `replace-blueprint` 单事务提交，一次应用只形成一条历史记录。条件、表达式与动作继续由 canonical parser/compile 失败关闭校验。宿主如提供模拟，只调用 Core compile/trace，不发送宿主事件、不调用 host action、不改变量、不写历史。

### 2. `editorDescriptor` 是 JSON-safe 声明式作者描述

物料 Manifest 的可选 `editorDescriptor` 按 `appearance`、`data`、`interaction`、`events` 四个语义分区声明可编辑字段、canonical target、受 schema 校验的 `path`、内建 control、条件显示与帮助文本。它只描述「编辑什么」与「使用哪种内建控件」，不描述「如何渲染 DOM」；所有 label、help、option、default 与 validation 必须是 JSON-safe 数据；`path` 是经 schema 校验的 canonical 路径而非任意 document pointer；`when` 只允许有限的结构化比较、存在性与枚举比较，不允许表达式脚本、函数或任意谓词。字段、section、array item、condition、schema depth、数组长度与 manifest bytes 均设上限；未知字段、危险 path、非 JSON 值、超深/超大结构 fail closed 并返回定位诊断，不得注册或渲染无效作者描述。既有 `propertyPanel`/`stylePanel` 继续有效，Descriptor 是其超集迁移路径，不删除既有字段。

`editorDescriptor.events` 是可用事件、显示信息、payload 字段与 capability 的事实来源：新建规则只允许选择文档中真实组件已经声明且允许用于 Blueprint 的事件。为缺少 capability 的事件创建 trigger，或提交不符合 payload schema 与容量限制的事件数据时 fail closed，保留 document 与 history 并返回可定位诊断。

### 3. 内建作者控件边界与组合语义

内建控件只包含被多个物料证明可复用且由 Descriptor 声明的通用编辑需求：既有 scalar（text/number/boolean/select/color/json）与按风险逐步增加的 group、array、repeatable array、reorderable array、field selector、unit number 等 primitive。需要注入 component、function、DOM、Promise、回调、代码编辑器、图形编辑器或领域专用 UI 的编辑需求，不得实现为 Base Screen 内建控件，一律通过宿主作者桥交给宿主；宿主授权插件贡献控件走 `control: 'custom'` + `kind: 'inspectorControl'` 的独立通道（ADR-0073），不属于内建控件集合。控件须支持稳定的 disabled、readonly、invalid、busy、empty 与 reset 状态，状态切换不得产生布局抖动。所有写入经 Core transaction 原子提交，成功一次最多产生一个 history entry，唯一 canonical 状态源保持不变。

### 4. 宿主作者桥：detached JSON 与专用提交入口

`contracts` 定义 JSON-safe 的 authoring request、detached context、commit result 与容量限制；Engine 通过公开 Custom Element method 与 CustomEvent 提供宿主作者桥。上下文必须是 detached JSON，不包含 DOM、class instance、port、function 或内部 controller 引用；宿主只能通过公共 `@base-screen/*` exports 集成，不得访问 Shadow DOM、内部 Store 或 `src` 路径。提交方法为用途明确的专用入口（组件文本编辑等），提交时校验 requestId 归属、expected revision、component identity、目标 schema、容量限制与 Designer unload/dispose 状态；陈旧、跨实例、无效或超限提交 fail closed，不修改 document、history 与其他实例。请求事件只携带请求信息（requestId、revision、快照），不等待编辑器 Promise；宿主可打开长时间编辑会话，之后通过专用 commit method 返回 canonical candidate。`requestComponentTextEdit` 保留，`cancelAuthoringEdit` 释放 pending request。为宿主编辑器长期开放通用 `executeCommand()` 作为唯一提交路径被拒绝：它缺少 requestId/revision/身份守护。

### 5. 一体化工作台壳层与工作台模式

Designer 提供常驻 48px 全局工具栏和 `canvas | blueprint` 工作台模式。预览、保存、发布、主题、问题、面板与项目状态只有一套；模式切换不重建顶部栏或 Designer。Blueprint 直接修改当前 `ScreenDocument`，复用 Core 命令、`DesignerSession` 历史、脏状态与项目 revision；不再提供 Blueprint 草稿、应用、取消或 pending authoring generation。组件文本 authoring request 保留。

### 6. 职责划分

Base Screen 拥有工作台壳层、左右面板、底部状态、搜索、语义图投影、canonical mutation、compile/trace、history 和失败策略；宿主拥有中央图形渲染技术——Vue Flow、Dagre、画布手势、缩放、MiniMap、自动布局和局部工具栏。Base Screen 不依赖 Vue、Vue Flow 或 Dagre，不吸收宿主业务基础设施或图形框架；宿主不访问 Shadow DOM、内部 Store 或私有源码。

### 7. 中央图形 slot 与严格命令协议

中央图形通过固定 `base-screen-designer-blueprint-canvas` slot（`BASE_SCREEN_DESIGNER_BLUEPRINT_CANVAS_SLOT`）接入。Base Screen 向 slot 元素发送冻结、JSON-safe、有界的权威状态事件 `base-screen-blueprint-canvas-state`（detail 携带 `BaseScreenBlueprintCanvasState`：`generation`、`documentRevision`、`projectRevision`、`active`、`canUndo`/`canRedo`、`graph`、`selection`、`diagnostics`、`trace`）。宿主只通过 composed+bubbling 的严格命令事件 `base-screen-blueprint-canvas-command` 返回操作，命令基础字段为 `commandId`、`generation`、`documentRevision`；协议用它拒绝未知、重复、过期和越界命令，拒绝结果以 `{ commandId, status: 'rejected', diagnostics }` 返回并在拒绝后重发权威状态。

### 8. session 状态与 `blueprint.layout` 的边界

模式、两边选择、临时拖动和 trace 高亮属于 Designer session；`blueprint.layout` 继续只保存节点位置（`nodes`）与视口（`viewport`）。拖动、缩放和自动布局只在手势结束时提交（`commit-layout` / `commit-viewport`），一个完成的用户操作最多形成一条历史。任意连线、回路、脚本节点、隐藏控制流或编辑器会话状态不得写回 ScreenDocument；规则列表编辑、搜索、选中节点与视口不进入文档。

### 9. slot 生命周期、原子回退与模式变化事件

Canvas 与 Blueprint 中央宿主都保持挂载。非活动面通过 `active` 暂停交互；重新激活时宿主重新测量图形。slot 缺失时 Blueprint 页签禁用；活动期间 slot 被移除时原子回退 Canvas 并发出诊断和模式变化事件 `base-screen-designer-workbench-mode-change`，其 detail 为 `{ previousMode, mode, reason }`，`reason` 取 `BaseScreenDesignerWorkbenchModeChangeReason = 'user' | 'api' | 'fallback'`（回退即 `fallback`）。宿主应保持中央元素挂载。

### 10. 公开 API 与同交付窗口升级

公开 API 增加 `workbenchMode`、`setWorkbenchMode`、`initialWorkbenchMode` 和模式变化事件，SDK 原样转发。Blueprint detached authoring 类型和方法直接移除，不保留并行兼容分支或版本后缀。Base Screen 与宿主协议消费者必须在同一交付窗口升级，回滚也同时回滚两侧；ScreenDocument schema、数据库和存量文档无需迁移。

### 11. 宿主左侧分组跨模式复用

ADR-0062 的宿主左侧分组通过严格 `leftPanelGroups[].workbenchModes` 选择 Canvas、Blueprint 或两者（省略时仅用于 Canvas），并投影到 Blueprint `rail-tabs`。Canvas 与 Blueprint 分别保留当前 Tab，但同一分组始终复用一份公开命名 slot/tabpanel；模式切换不得重新挂载宿主 light DOM 子树，宿主仍拥有其内容生命周期与业务状态。

## 后果

- 画布与 Blueprint 按时间顺序共享撤销/重做、脏状态、预览、保存和发布约束；复杂联动仍按真实执行顺序阅读，用户不需要理解图论或手写 JSON。
- Base Screen 承担当前实例内的有界作者内核，但不吸收宿主业务基础设施或图形框架；中央图形可独立演进，只要遵守公开协议。
- 宿主产品级可视编辑体验与 Base Screen 的 canonical 语义各归其位：Engine 不再实现编排工作区，宿主也不再维护第二套工作台与待应用草稿。
- detached 分支的移除是行为收紧：任何仍依赖整屏 detached Blueprint 请求/提交的接入必须与 Base Screen 同窗口升级，不存在兼容桥。

明确推迟或非目标：

- 图形库与图内核：本期不引入任何图库，不新增外部生产依赖、不新增核心 package、不改 `scripts/check-boundaries.mjs` 白名单。若 canonical 语义将来增加并行、分支或循环，再按 ADR-0019 独立评估图内核；当前不为假想图能力增加文档字段或兼容层。
- 代码编辑器、完整 ECharts option 编辑器、领域专用编辑器及 Material 源码由宿主拥有，不进入 ScreenDocument、history、导出物或 Base Screen 默认 bundle；宿主侧源码编译、类型检查与安全检查失败时保留旧 catalog 与合法 document，Base Screen 不接收源码、不执行编译，诊断只由宿主显示。
- 向宿主暴露的逃生口：拒绝可注入任意 function/component 的面板逃生口；拒绝 Manifest 携带 render function、formatter 或宿主服务对象。
- 把 ECharts 全部 option 字段映射为内建表单：只保留被证明可复用的语义子集，完整 option 只作为宿主高级编辑器输入并经 Material schema/adapter 校验后提交。
- 向宿主转嫁图形作者契约：ADR-0026 已拒绝在本期新增该公共 API 与维护面，ADR-0063 改为由 Base Screen 自己承载有界壳层，不新增宿主契约面。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0026 | canonical shape 不变、`host-action.actionId` 只读、Core `traceScreenBlueprintEvent` 只读 trace 与 dispatch 逐字段等价、诊断 fail closed、模拟不调用端口不写 history | canonical 与运行时约束全部生效；「表单为唯一作者路径、图形整体延后」的 Engine 内建范围先由 ADR-0028 部分取代，最终形态由 ADR-0063 决定 |
| ADR-0028 | `editorDescriptor` 四分区与 JSON-safe 上限、内建控件边界与状态、宿主作者桥 detached JSON 与 `requestId`/revision/身份/容量/unload 守护、`editorDescriptor.events` 事实来源、重型编辑器与源码归宿主 | 全部生效；其「宿主自行实现表单或图形 Blueprint 编辑器」的授权形态经 ADR-0061 演化，最终由 ADR-0063 收敛为一体化工作台 |
| ADR-0061 | canonical ECA 语义、Manifest 事件事实来源、严格 compile/trace、宿主业务边界、布局不进文档的取向、宿主模拟只走 Core compile/trace | 部分取代：决策 4、5、7、8 与「图布局不进入文档」的表述由 ADR-0063 取代（整屏 detached 宿主桥分支已移除）；其余要点进入本 ADR 决策 1、2、8 |
| ADR-0063 | 一体化工作台壳层与 `canvas \| blueprint` 模式、直接编辑当前文档无草稿、职责划分、slot 与命令协议、session 与 `blueprint.layout` 边界、slot 回退与 mode-change 事件、公开 API 与同窗口升级、左侧分组跨模式复用 | 全部生效，为本 ADR 的现行形态 |

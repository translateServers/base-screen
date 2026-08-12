# Designer 依赖候选评估

> 状态：已评审（2026-08-06 决策落地：vendor 合入，interactjs 未采纳）
> 日期：2026-08-05（2026-08-06 更新）
> 计划：[Designer 依赖引入计划](./implementation-plan.md)
> 评估基线：当前 Designer Product Completion tasks、checklist 和代码

## 1. 结论

当前 Designer Product Completion 的 Task 6-12 和 checklist 已完成，现有功能没有必须补装的外部生产依赖。
2026-08-06 重审：Designer Canvas Precision 多轮调整后交互品质仍不满足产品基准，构成新的需求证据。因
Moveable 上游停止演进，最终决策为**逻辑层源码 vendor**（见 [ADR-0020](../../../decisions/ADR-0020-designer-canvas-interaction-pilot.md)），
不引入 npm 依赖。vendor 前在仓库外临时目录做移植验证。

| 结论 | 依赖 | 当前动作 |
| --- | --- | --- |
| 条件候选 | `@floating-ui/dom` | 仅在新增碰撞感知的 anchored overlay Requirement 时进入试点 |
| 条件候选 | `@tanstack/virtual-core` | 仅在连续滚动大图层树出现可复现性能缺口时进入试点 |
| 条件候选 | `@dagrejs/dagre` | 仅在 Blueprint 图形投影成为生效中 Requirement 时进入试点 |
| 观察候选 | `@atlaskit/pragmatic-drag-and-drop` | 仅在图层需要复杂插入落点和自动滚动时重新评估 |
| 观察候选 | `interactjs` | 手势内核观察候选；逻辑层移植（Moveable/gesto vendor）后不再需要 |
| 观察候选 | `rbush` | 仅在大画布 profiling 证明候选查询是瓶颈时重新评估 |
| 已决策 | Moveable（npm 包） | 2026-08-06 决策：不引入依赖；其逻辑层以 MIT vendor 迁入 engine（见 [ADR-0020](../../../decisions/ADR-0020-designer-canvas-interaction-pilot.md) 与 [移植验证计划](../designer-moveable-pilot/pilot-plan.md)） |
| 当前拒绝 | Selecto、Scena Ruler、hotkeys-js、SortableJS、XYFlow System、ELK、CodeMirror | 不进入当前依赖预算 |

因此，当前建议仍是不修改 manifest。条件候选表示"架构上允许进入 Gate A"，不表示允许直接安装；Moveable
相关的交互品质缺口通过代码 vendor 解决，不占用依赖预算与唯一例外槽位。

## 2. 评估依据

### 2.1 当前实现覆盖

- 手势控制器已经处理多选移动、创建、缩放、旋转、平移、框选、pointer capture 和取消清理。
- operation registry 已统一 undo/redo、选择、剪贴板、编组、对齐、分布、viewport 和项目操作。
- Layers 已具有 canonical hierarchy 投影、搜索、折叠、重命名、排序、reparent、root drop 和增量展示。
- 画布已有 DPR 标尺、参考线、网格、screen-pixel threshold、组件/画布吸附和 transient preview。
- Blueprint 已有 canonical trigger、condition、expression、action、diagnostic、history 和键盘编辑路径。
- 工作台已有私有 Shadow DOM primitive、tooltip、dialog、菜单、状态和浏览器验收。

这些能力已通过当前 Spec 验收。替换为第三方实现必须证明新增 Requirement 的收益，不能只以代码量或旧项目
使用过该库为理由。

### 2.2 Registry 快照

以下数据于 2026-08-05 通过 `pnpm view` 获取。`dist.unpackedSize` 是 npm 包解包体积，不是实际 browser
bundle；候选进入 Gate D 后仍需测量当前 Vite 入口的 minified + gzip 增量。

| 依赖 | 查询版本 | 许可证 | 直接依赖概况 | `dist.unpackedSize` |
| --- | ---: | --- | --- | ---: |
| `@floating-ui/dom` | 1.8.0 | MIT | 2 个 Floating UI 内部包 | 174,208 B |
| `@tanstack/virtual-core` | 3.17.7 | MIT | registry 未列直接依赖 | 404,945 B |
| `@dagrejs/dagre` | 3.1.0 | MIT | `@dagrejs/graphlib` | 1,396,866 B |
| `@atlaskit/pragmatic-drag-and-drop` | 2.0.1 | Apache-2.0 | 3 个辅助包 | 462,657 B |
| `interactjs` | 1.10.28 | MIT | `@interactjs/types` | 1,398,773 B |
| `rbush` | 4.0.1 | MIT | `quickselect` | 48,823 B |
| `moveable` | 0.53.0 | MIT | 5 个，含 `react-moveable`、Croact 相关包 | 2,430,054 B |
| `selecto` | 1.26.3 | MIT | 10 个手势、样式和几何辅助包 | 910,936 B |
| `@scena/ruler` | 0.20.0 | MIT | 2 个 Croact 相关包 | 209,809 B |
| `hotkeys-js` | 4.0.4 | MIT | registry 未列直接依赖 | 4,577,219 B |
| `sortablejs` | 1.15.7 | MIT | registry 未列直接依赖 | 640,152 B |
| `@xyflow/system` | 0.0.79 | MIT | D3 drag/selection/zoom 等 8 个包 | 686,009 B |
| `elkjs` | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later | registry 未列直接依赖 | 8,046,232 B |
| `@codemirror/view` | 6.43.8 | MIT | state、style、keyname 等 4 个包 | 1,252,378 B |

版本只用于本次评估，不构成未来安装版本。真正引入时必须重新查询 registry、许可证、维护状态和漏洞。

## 3. 可进入条件候选池

### 3.1 `@floating-ui/dom`

**适用范围：** anchored menu、popover、tooltip 的 flip、shift、offset、arrow 和 viewport collision 计算。

**可以考虑的原因：**

- framework-neutral，只处理定位，不要求 React 或全局 Store；
- API 可以隔离在 Engine 私有 overlay positioner 后；
- 浮层边界、滚动祖先、缩放和碰撞处理容易产生浏览器边缘 bug，重复自研价值低；
- 直接依赖集中在同一项目内部，当前 registry 体积较小。

**不能由它负责：** focus trap、ARIA、keyboard navigation、dialog inert、operation enablement 和 overlay 状态。

**触发条件：** 新增至少一种必须跟随锚点、处理 viewport/scroll collision 的工作流，并且现有固定位置 primitive
无法满足 browser case。当前 canvas guide、selection、marquee 和全屏 dialog 不需要它。

**试点边界：** 只允许一个 `overlay-positioner` 私有 adapter；不得将 Floating UI 类型或 middleware 配置公开。

### 3.2 `@tanstack/virtual-core`

**适用范围：** 大型 Layers 连续滚动窗口化、动态测量和 scroll-to-focused-item。

**可以考虑的原因：**

- core 包不绑定 React，DOM 渲染继续由 Engine 控制；
- 不改变 canonical hierarchy、selection、drag/drop 或 history；
- 若产品要求千级节点连续滚动，它能减少 measurement、range 和 overscan 的重复实现。

**当前不安装的原因：** 当前 Layers 已按固定 page size 增量展示并通过现行性能验收；pagination 与 virtualization
是不同产品行为，不能为未出现的需求提前增加状态和滚动复杂度。

**触发条件：** 新 Requirement 明确要求连续滚动或 scroll-to-focus，且 browser profiling 证明当前增量展示不能达到
测试矩阵冻结的输入和滚动阈值。

**试点边界：** 只负责可见 range 和 measurement；tree flatten、ARIA、selection、rename、drop 和 transaction
继续由 Base Screen 持有。

### 3.3 `@dagrejs/dagre`

**适用范围：** Blueprint 可选图形投影的确定性有向图布局。

**可以考虑的原因：**

- framework-neutral，MIT，依赖面比完整图编辑器和 ELK 小；
- 可以只输入临时 node/edge geometry，输出 layout 后放入 Engine session；
- 不需要把第三方 graph shape 写入 canonical Blueprint；
- 图布局是成熟算法问题，自研通常不能形成产品差异。

**当前不安装的原因：** 当前 Spec 已明确图形呈现不是公共契约，现有表单和键盘路径已经完成 canonical
Blueprint authoring。只有正式增加图形投影 Requirement 后才有收益。

**试点边界：** 只允许 layout adapter；viewport、selection、edge rendering、keyboard path 和 canonical edit
仍属于 Engine。必须验证 tree-shaken bundle 的实际 gzip 增量。

## 4. 仅观察，不进入当前预算

### 4.1 `@atlaskit/pragmatic-drag-and-drop`

它是 framework-neutral 且依赖规模可控，可用于图层复杂 drag/drop、drop indicator 和 auto-scroll。但当前 Layers
已完成 reparent、root drop 和事务校验；该库也不会自动提供 canonical tree validation 或完整键盘树操作。

只有新增“行间精确插入、跨滚动容器自动滚动、复杂 drop preview”Requirement 时重新评估。即便采用，也只能
替换 DOM 手势层，不能替换 `createReparentTransaction` 或 hierarchy guard。

### 4.2 `interactjs`

它不依赖 React，直接依赖面也比 Moveable 小，技术上符合框架约束。但现有 gesture controller 已经和
selection、capability、snap、transient preview、Core transaction 深度集成。现在迁移会增加 adapter、事件翻译和
回归矩阵，不能缩短已经完成的周期。

只有后续明确需要多点触控、惯性、复杂手势 modifier，并且原生控制器评估超过 10 个工程日时才重新进入 Gate A。

**2026-08-06 终审（未采纳）**：吸附品质缺口的根因在吸附语义本身；interactjs 的 snap modifier 只有
range/offset/anchors/grid 距离竞争，**没有释放带滞后与同锚点跟随**——与生效 Spec（designer-canvas-precision
R1/R2）冻结的行为契约不符，替换需要改 Spec 或在其上层补写（回到自研）。吸附数学最终以 Moveable snappable
MIT vendor 迁入 `common/vendor`（[ADR-0020](../../../decisions/ADR-0020-designer-canvas-interaction-pilot.md)），
无需引入 npm 依赖。该结论仅在产品明确要求多点触控/惯性且原生评估超限时重审。

### 4.3 `rbush`

它体积和依赖面较小，适合大量二维 bounds 的空间查询。但当前 snap 候选是每轴坐标集合，优先做每次手势缓存、
排序复用和二分查找比引入 R-tree 更匹配数据模型。

只有 profiling 证明千级组件下 marquee 或 snap 的二维查询占主要帧时间时才重评；不能用组件数量猜测性能问题。

## 5. 当前拒绝

### 5.1 Moveable

拒绝当前 `moveable` 包。虽然提供 vanilla API，但 registry 显示它直接依赖 `react-moveable`、`croact-moveable` 和
Croact。它与“Designer 生产路径不引入 React 类框架、控制传递依赖”的目标冲突，也会重复现有 transform、snap、
transaction 和 overlay 实现。

### 5.2 Selecto

拒绝 `selecto`。当前框选和 Core rectangle query 已完成；该包带来 10 个直接依赖，还需要额外适配 selection
reducer、分组、locked/hidden、Shadow DOM 和 pointer recovery，收益不足。

### 5.3 Scena Ruler

拒绝 `@scena/ruler`。当前原生标尺已处理 zoom、DPR 和 labels；候选仍依赖 Croact 相关包，只替换很小的渲染层。

### 5.4 hotkeys-js

拒绝 `hotkeys-js`。Designer 真正复杂的是 operation availability、scope、editable target、IME、双实例和
Shadow DOM focus，而不是 chord 解析。现有 operation registry 更接近产品真相，库不能消除这些代码。

### 5.5 SortableJS

拒绝 `sortablejs`。它适合平铺排序，不负责 canonical tree reparent、循环检测、children capability、history 和
键盘 tree semantics；现有原生 DnD 已覆盖当前 Requirement。

### 5.6 XYFlow System 与 ELK

- 拒绝 `@xyflow/system`：当前为 `0.0.x`，带入 D3 交互栈和其系统模型，容易让第三方 graph shape 进入 Engine。
- 拒绝 `elkjs`：解包体积显著更高，许可证审查和 worker/bundle 成本也高于当前需要；若只做有向图布局，Dagre
  是更小的候选。

### 5.7 CodeMirror

拒绝当前引入 CodeMirror。现有 Blueprint 和 JSON 字段具有结构化表单、validation 和 canonical commit 边界。
为了改善少量 JSON textarea 引入编辑器状态、语言和视图依赖，不符合唯一例外预算。若未来产品明确要求大型脚本或
代码编辑，还会与 canonical document 禁止 executable expression 的边界冲突，需要先更新 Spec。

## 6. 推荐执行

1. 当前不修改任何 package manifest、lockfile 或 boundary 白名单。
2. 把唯一生产依赖例外槽位保持为空，不同时预装三个条件候选。
3. 新需求优先在 `@floating-ui/dom`、`@tanstack/virtual-core`、`@dagrejs/dagre` 中按对应触发条件选择一个进入
   Gate A；不存在跨能力复用理由时不组合安装。
4. 试点必须测量 lockfile 新增 package 数、实际 Vite gzip 增量、双实例、Shadow DOM、disconnect 和 browser
   matrix，不能使用 npm 解包体积代替 bundle 证据。
5. 任何候选合入前更新 ADR、Spec/test matrix、`scripts/check-boundaries.mjs` 和许可证记录。

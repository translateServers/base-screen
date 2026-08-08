# Designer Authoring And Project Lifecycle Spec

> 状态：已归档
> 最近更新：2026-08-04
> 归档于：2026-08-04
> 归档原因：由现行 [Designer Engine 规格](../designer-engine/spec.md) 统一承接 Engine 产品规划；本文只保留历史需求与实施语境
> 定位：以 Nebula Designer 的可观察样式与功能为兼容基准，增量冻结 Base Screen Designer 与项目生命周期
> 依据：[ADR-0006](../../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[ADR-0012](../../../decisions/ADR-0012-designer-project-lifecycle.md)、[Designer Engine Spec](../designer-engine/spec.md)、[Core Domain Spec](../core-domain/spec.md)、[Plugin Core Contract Spec](../plugin-core-contract/spec.md)
> 来源：[Nebula Designer Parity Provenance](../../../provenance/nebula-designer-parity.md)
> 实施：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)

## 1. Why

`BaseScreenDesignerElement` 当前完成单选、拖拽、基础属性、undo/redo 和 project load/save，Core
已经提供多选状态、旋转 bounds、marquee query、reparent 与 alignment/distribution 纯算法。但
Engine 还没有把这些能力组装为可用设计器，项目会话也没有 publish、冲突、取消、dirty baseline
和 retry 语义。

这两组缺口由同一个 Engine session 拥有：设计操作决定当前 document，persistence baseline 决定
该 document 是否 dirty。将它们放在同一增量 Spec 可以避免 UI 手势、历史和异步 save 各自维护
不同基线。

本增量同时把 Nebula Designer 作为产品兼容目标：尽可能复现其紧凑工作台结构、画布交互、工具、
图层、属性、数据、事件、历史、快捷键、预览和项目流程。兼容目标是可观察行为与视觉测量值，
不是源码同构；Base Screen 必须独立实现并继续遵守十二包边界。

## 2. 生效前置

- [ADR-0012](../../../decisions/ADR-0012-designer-project-lifecycle.md) 已接受，冻结
  `ScreenProjectAdapter` 的 publish、AbortSignal、冲突、retry 和 baseline 所有权；ADR-0006 继续只
  定义 Engine DOM 与手势边界。
- Public adapter/result/diagnostic 变更同步 Contracts Foundation、Core Domain 和 Designer Engine
  Spec；不得只在 Engine 私有类型中增加兼容分支。
- grouping 自动创建容器时，宿主必须显式配置已启用且 `designCapabilities.children=true` 的
  `groupMaterialType`；不得向 canonical document 偷渡 synthetic node。
- `toolMaterialTypes` 是 Engine 配置的显式映射；缺失、未启用或能力不兼容的工具必须 disabled。
- direct-document baseline 是 document-only canonical baseline；save pending 的响应只在 current
  document 仍等于 submitted snapshot 时替换 present，否则仅推进 submitted baseline。
- Nebula 参考 commit、路径、许可状态和 no-copy 结论已记录在 provenance；当前参考仓库没有可确认的
  LICENSE，因此不得复制其 TypeScript、JSX、CSS、配置、SVG、字体或测试资产。

## 3. 目标

- 增加 resize/rotate handle、多选、marquee、group/reparent、alignment/distribution、Layers、
  clipboard 和 schema-driven property panel。
- 所有高层编辑动作通过 Core command/transaction，并只提交一个 history entry。
- 建立可取消、generation-safe 的 load/save/publish controller。
- 用 canonical baseline 精确跟踪 dirty，使 undo 回到保存点时重新 clean。
- 显式处理 conflict 和 retry，不自动覆盖远端或自动重放 mutation。
- 在 Base Screen 能力边界内达到 Nebula 工作台的视觉密度、布局、画布工具和作者工作流 parity。
- 以分层 screenshot/geometry/workflow 门禁量化 parity，而不是依赖主观“看起来相似”。

## 4. 非目标

- 不修改 Remote Sandbox、Host Resource timeout/cancel、Blueprint schema/compiler 或 plugin
  contribution runtime projection。
- 不实现 React/Vue material bridge 或 installed-tarball consumer。
- 不把 Nebula importer 变成 Designer UI，也不允许 importer 直接 save/publish。
- 不引入 React/Vue、第三方画布框架、全局 Store 或模块级 current session。
- 不实现多人实时协作、merge editor、force overwrite、系统剪贴板或移动端编辑承诺。
- 不修改 Renderer 的 Material DOM/model/event/resource 生命周期。
- 不复制 Nebula 源码、样式表、主题配置、组件资产、图标、字体文件或截图到 MIT 发布产物。
- 不复现 Nebula 的鉴权、TanStack Router/Query、项目列表、后端 DTO、API/dataset/requestApi、
  Monaco loader、动态全局变量或 localStorage snapshot 策略。

## 5. 所有权与并行边界

| 领域 | 本 Spec 拥有 | 只消费 |
| --- | --- | --- |
| Contracts | Project Adapter request/result/capability 与 project diagnostic | Host Resource/Blueprint ports |
| Core | 编辑 transaction、selection/geometry 的缺口增量 | Canonical parser 与 runtime capability index |
| Engine | Designer session、parity shell/UI、history、clipboard、project controller、Blueprint authoring UI | Material Catalog/Manifest、Renderer、Blueprint runtime contract |
| Testing | Designer Core/DOM/Playwright harness | Runtime conformance harness |

配套的
[Runtime And Ecosystem Hardening Spec](../runtime-ecosystem-hardening/spec.md)
不得修改 `ScreenProjectAdapter`、Engine session、dirty baseline 或 Designer Shadow DOM。Importer 输出只
能由宿主作为普通 canonical document 交给 Designer，不共享 migration state。

## 6. Project Adapter 契约

### 6.1 Request 与 capability

```ts
interface ScreenProjectLoadRequest {
  readonly projectId: string;
  readonly signal: ScreenAbortSignal;
}

interface ScreenProjectSaveRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly document: ScreenDocument;
  readonly signal: ScreenAbortSignal;
}

interface ScreenProjectPublishRequest {
  readonly projectId: string;
  readonly revision: string;
  readonly signal: ScreenAbortSignal;
}

interface ScreenProjectAdapter {
  readonly capabilities: { readonly publish: boolean };
  load(request: ScreenProjectLoadRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  save(request: ScreenProjectSaveRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
  publish?(request: ScreenProjectPublishRequest): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
}
```

- Adapter response 在应用前必须重新 parse `ScreenProjectEnvelope` 和 canonical document。
- `revision` 是 opaque optimistic concurrency token，Engine 不推算、不 trim、不递增。
- `capabilities.publish=true` 时 `publish` 必须存在；两者不一致在绑定 adapter 时 fail closed。
- publish 只提交当前 revision，不携带 document，也不隐式 save。
- adapter 不接收 Router、Store、credential 或 UI callback。

### 6.2 Diagnostic

Contracts 增加稳定 code：

- `PROJECT_ADAPTER_INVALID`
- `PROJECT_UNAVAILABLE`
- `PROJECT_CONFLICT`
- `PROJECT_ABORTED`
- `PROJECT_DIRTY`
- `PROJECT_PUBLISH_UNAVAILABLE`

普通 adapter failure 通过 `ScreenParseResult` 返回。Engine 捕获 throw/rejection 后只产生固定
`PROJECT_UNAVAILABLE` 或 `PROJECT_ADAPTER_INVALID`，不回显原始 Error、payload 或 stack。

## 7. Project Session 状态机

```ts
type ScreenProjectPhase =
  | 'unloaded'
  | 'loading'
  | 'ready'
  | 'saving'
  | 'publishing'
  | 'conflict'
  | 'error'
  | 'disposed';
```

### 7.1 Baseline 与 dirty

- load 成功建立 `{ projectId, revision, canonicalDocument }` project baseline；direct document
  replace 建立不含 projectId/revision 的 document baseline。
- dirty 由当前 document 的 canonical serialization 与 baseline 比较得到，不使用 sticky boolean。
- 每次 dirty 布尔值实际变化时只派发一个 `base-screen-dirty-change`。
- undo/redo 回到 baseline 时 dirty 变为 false；离开 baseline 后再次为 true。
- direct document 模式仍按 document baseline 报告 dirty，但 save/publish 保持 unavailable。
- save 成功以服务端 envelope 建立 submitted baseline。若 save pending 期间继续编辑，当前 document
  不被 response 覆盖，并相对新 baseline 保持 dirty。
- publish 成功只更新 project envelope/revision/published metadata，不清除本地未保存编辑。

### 7.2 Generation 与取消

- 每次 load/save/publish 绑定 project generation 和独立 AbortController。
- project replacement、`unload()`、`disconnectedCallback()` 和 dispose 中止全部 pending operation。
- 新 load 中止旧 load；mutation 首版串行执行，不允许 save/publish 并发。
- 迟到 response 必须同时通过 signal、generation、projectId 和 submitted revision 检查才能应用。
- abort 返回 `PROJECT_ABORTED`，不派发 success、不弹 error UI、不推进 revision/baseline。
- 暴露 `cancelProjectOperation()`；重复取消幂等。

### 7.3 Conflict

- Adapter 返回 `PROJECT_CONFLICT` 时保留当前 document、history、selection、revision 和 baseline。
- phase 进入 `conflict`，派发一次 `base-screen-project-conflict`。
- UI 提供“Reload remote”和“Continue editing”。Reload 在 dirty 时必须二次确认 discard。
- Continue 只关闭 conflict panel，不修改 revision；后续 save 可以再次 conflict。
- 首期不提供 force overwrite、自动 merge 或静默 last-write-wins。

### 7.4 Retry

| 操作 | 自动 retry | 手动 retry |
| --- | --- | --- |
| load + `PROJECT_UNAVAILABLE` | 最多 2 次，250ms/1000ms；abort 立即停止 | 支持 |
| save/publish | 从不自动 retry | 支持，重新读取当前 document/revision 并重新校验 |
| conflict/auth/validation/dirty | 不 retry | 仅在用户解决原因后重新发起 |

retry timer 属于当前 generation，unload/disconnect/dispose 时必须清理。测试通过可注入 scheduler 控制
时间，不依赖真实 sleep。

### 7.5 Public operation

Designer 至少提供：

```ts
load(projectId: string): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
save(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
publish(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
retryLastProjectOperation(): Promise<ScreenParseResult<ScreenProjectEnvelope>>;
cancelProjectOperation(): void;
```

重复 save 在同一 current snapshot 上返回同一 in-flight Promise；document 改变后再次 save 是新的
operation。Publish 要求 adapter capability、phase=ready 且 dirty=false，否则返回稳定 diagnostic。

## 8. Designer Authoring

### 8.1 Selection 与 marquee

- 单击选择一个 visible component；空白单击清空。
- Shift/Ctrl/Cmd+单击切换 selection；`focusedComponentId` 是最后交互且仍被选中的 component。
- 从空白处拖动显示 marquee；默认 `intersect`，按 Alt 切换 `contain`。
- modifier 未按下时 marquee 替换 selection，Shift 时做并集。
- hidden component 不可选择；locked component 可在 Layers 选择查看，但画布手势和 mutation 禁用。
- selection 始终通过 `reduceScreenInteraction` canonicalize，不维护第二套 UI selection。

### 8.2 Resize 与 rotate

- 单选显示 8 个 resize handle 和 1 个 rotate handle；多选显示整体 bounds handles。
- Manifest `designCapabilities.resize/rotate` 是 UI、pointer 和 command 的共同 allowlist。
- resize 最小值为 1 x 1；Shift 保持比例，Alt 以中心为基准。
- rotate 时 Shift 以 15 度吸附，结果规范化到 `[-180, 180)`。
- 多选 resize/rotate 保持各 component 相对 selection bounds 的比例和中心关系。
- pointer move 只写 transient overlay/DOM preview；pointer up 生成一个 transaction 和一个 history entry。
- pointercancel、lost capture、blur、tool change、document replace/unload/disconnect 恢复手势 baseline。

### 8.3 Group 与 reparent

- Layers drag 可把 selection reparent 到已启用且 `designCapabilities.children=true` 的 component。
- reparent 保持画布绝对视觉位置，并把坐标转换为新 parent local space。
- Core 继续拒绝循环引用、把 parent 放入后代、locked/hidden 非法 mutation 和不兼容 parent。
- Group 命令使用显式 `groupMaterialType` 创建一个 container component，再 reparent selection。
- `groupMaterialType` 缺失、未启用或 children=false 时 Group 命令禁用，不选择隐式 fallback。
- Ungroup 把 children 移到 group parent，保持画布位置/z-order，然后删除空 group。
- group/ungroup/reparent 各作为一个 Core transaction 和一个 history entry。

### 8.4 Alignment 与 distribution

- 支持 left/center/right、top/middle/bottom alignment。
- 支持 horizontal/vertical equal-gap distribution；少于 3 个 movable component 时禁用。
- 复用 Core `calculateScreenAlignment`/`calculateScreenDistribution`，Engine 不复制 geometry。
- 每个 component 的不同 position 通过 transaction 中独立 command 应用，整体只提交一次 history。
- locked component 不移动，但继续按 Core 既有规则作为 reference/fixed point。

### 8.5 Layers

- Layers panel 展示 canonical parent tree、name、type、hidden 和 locked。
- 支持 canvas selection 双向同步、同级 reorder、rename、hide/lock 和 drag reparent。
- painter order 和树顺序来自 Core hierarchy helper，不维护第二份数组。
- 搜索只过滤视图；缺失 Material 显示 diagnostic，不删除 component。
- selection 含多个 node 时，panel 显示统一 selection 状态，不把 focused node 误当单选。

### 8.6 Clipboard

- Ctrl/Cmd+C 把 selection 的 detached canonical component subtree 写入 Designer 实例内存。
- Ctrl/Cmd+V 为所有 node 生成新 id，重写内部 parent 引用并偏移 20 x 20，与 Nebula 画布语义对齐。
- 连续 paste 累加偏移；project replace/unload/dispose 清空 clipboard。
- 不复制 selection、history、runtime data state、pending operation、project revision 或 baseline。
- 首期不使用系统 Clipboard API，不跨 Designer 实例或浏览器 tab。

### 8.7 Manifest-driven Property Panel

- geometry/status 通用字段由 Engine 固定提供；props 字段只从 focused Material Manifest 的
  `propertyPanel` 和 `propsSchema` 生成。
- control 白名单精确复用 `text | number | boolean | select | json`，不得接受 render callback。
- 每次提交构造完整 next props，并先调用 Plugin Core props validator；失败保留输入 draft，不执行
  Core command、不写 history。
- 多选时只显示兼容的通用字段；首期不批量编辑 Material props，避免异构 schema 猜测。
- `select` 选项来自对应 enum schema；control/schema 不兼容时显示 deterministic diagnostic。
- property edit 成功只提交一个 `update-components` command 和一个 history entry。

## 9. UI 状态

- Toolbar 提供 undo/redo、copy/paste、group/ungroup、align/distribute、save/publish 和 zoom 命令；
  不支持或不可用的命令 disabled，不在 click handler 中静默失败。
- Canvas overlay 拥有 selection/marquee/handles/guides，Renderer root 只包含真实 Material element。
- 左侧 Material rail 与 Layers 使用 tabs；右侧 Property panel 始终对应 focused selection。
- saving/publishing 显示稳定 busy 状态并禁用冲突 mutation；普通画布编辑仍可继续，结果按 submitted
  baseline 规则处理。
- conflict/error panel 不卸载 Designer，不清空 history 或 selection。
- 所有按钮使用明确 command 名称/图标和 tooltip；Shadow DOM 内键盘事件不得劫持文本输入。

## 10. History 与事务

- Engine 增加 `executeTransaction()`，先纯计算全部 command，再调用 Renderer；任一步失败时 document、
  history、selection 和 DOM 保持原值。
- drag/resize/rotate/marquee 不为每帧写 history。
- group/ungroup/reparent/alignment/distribution/paste 各只提交一个 history entry。
- undo/redo 后重新计算 dirty、reconcile selection/Layers/Property panel，并取消 active gesture。
- persistence response 不写入用户 history；服务端若返回不同 canonical document，只有在 current
  document 仍等于 submitted snapshot 时才能 replace present 并重建 baseline。

Designer session 的 history limit 固定为 50，与 Nebula 可观察行为一致；Core 的通用默认值不因此
改变。Viewport、guides、panel layout、clipboard、preview state 和 runtime overrides 不进入 history。

## 11. Nebula Designer Parity Baseline

### 11.1 兼容原则与层级

- **P0 Structure**：工作台区域、稳定尺寸、主题变量、面板折叠/缩放和窄屏降级。
- **P1 Authoring**：画布视口、七工具、选择/变换、图层、属性、历史、剪贴板和快捷键。
- **P2 Integration**：static/host-resource 配置、Blueprint 作者界面、交互模式、预览、导入导出和
  Project Adapter 状态。
- **P3 Host-specific**：鉴权路由、API/dataset、动态变量、requestApi、Monaco 和 snapshot policy
  明确不进入 Base Screen parity；宿主可通过既有端口另行组装。

P0-P2 都属于本 Spec 的目标，但 P2 中 Blueprint authoring 必须等待 Runtime And Ecosystem
Hardening Spec 冻结当前 Blueprint shape。等待上游期间可以完成 shell 和 fake-contract UI，不得复制或
猜测 runtime schema。

### 11.2 工作台几何

| 区域 | Base Screen parity 目标 |
| --- | --- |
| Top toolbar | 48px 高，紧凑命令分组，常用 icon button 28px |
| Bottom status | 28px 高，显示坐标/尺寸/旋转、缩放、模式、dirty/operation 状态 |
| Left panel | 默认 240px，范围 200..400px，折叠后 48px |
| Right panel | 默认 288px，范围 240..480px，折叠后 48px |
| Panel resize handle | 4px，不因 hover 改变布局尺寸 |
| Rulers | 顶部和左侧各 20px |
| Workspace grid | 默认 24px，可关闭，不进入 document/history |
| Panel section header | 32px 高，紧凑但可访问 |

- 面板宽度、折叠和 UI hidden 状态属于每实例 preference，不进入 canonical document/history。
- 默认不隐式访问 localStorage；宿主可监听 layout event 并在下次创建时显式回填 preference。
- 工作台完整支持的最小 viewport 为 1024 x 640；更小时显示不可编辑警告，仍保证 dialog 不溢出、
  element 不抛错且 Viewer preview 可正常工作。

### 11.3 主题与视觉语言

- 提供 light/dark 两组 Base Screen CSS custom properties：近中性背景/表面、清晰边框、高对比文字和
  紫色强调色，视觉方向接近 Nebula，但 token 名称和值由 Base Screen 独立设计。
- 默认字体栈允许宿主已有 Geist，回退 `ui-sans-serif, system-ui, sans-serif`；package 不分发字体。
- 控件和容器圆角不超过 8px；toolbar/panel 使用平面分区，不嵌套装饰卡片。
- 不增加 React/Radix/Lucide dependency。图标使用 Base Screen 独立实现的最小 SVG/symbol 集；熟悉
  命令优先 icon，所有不熟悉 icon 有 tooltip 和可访问名称。
- hover/focus/active/disabled/busy/conflict 状态使用同一语义 token，文本和图标在 light/dark 下均满足
  WCAG AA；动画遵守 `prefers-reduced-motion`。

### 11.4 Canvas、Viewport 与工具

- Designer zoom UI 固定 10%..500%，支持 cursor-anchored wheel zoom、fit screen 30px margin、
  zoom in/out、100% reset 和 Space 临时 Hand。
- 支持 pan、20px rulers、draggable guides、24px grid、grid snap、5px smart-guide threshold；guide、
  grid 和 smart-guide state 不进入 document/history。
- 工具 registry 提供 Select(V)、Hand(H)、Text(T)、Rectangle(R)、Ellipse(E)、Image(I)、Zoom(Z)。
- create tool 通过显式 `toolMaterialTypes` 映射到已启用 Material；缺失或 capability 不兼容时工具
  disabled，不创建隐式内置 type。
- Text 点击创建；shape/image 支持点击或拖拽创建；小于 4px 的拖拽取消，不产生 history。
- 支持 select-all（排除 hidden/locked）、Alt-drag duplicate、双击进入 group 和分层 Escape。

### 11.5 Layers、Properties 与数据

- 左面板提供 Materials/Layers tabs；Layers 显示 component count、group tree、collapse、rename、
  multi-select、visibility、lock、top/bottom/step ordering、group/ungroup 和 context commands。
- 组件数不超过 50 时允许直接 drag sort；更大集合可 virtualize，但所有排序命令仍可用。
- 右面板提供 Appearance/Data/Interaction/Events tabs。Appearance 包含 geometry、rotation、z-index、
  lock/hide 和 Manifest property fields；没有选中时显示 Canvas settings。
- Data tab 只编辑 canonical static/host-resource source。API、dataset、header、URL 测试和自动 refresh
  不进入 Base Screen package。
- Interaction tab 控制 design/interaction mode 和 Material 可交互状态；Events tab 提供“Open
  Blueprint”以及当前 component 相关 rule 的只读摘要，不复制 Nebula QuickEvent 模板逻辑。
- JSON property editor 仅使用 Base Screen 自有 textarea/JSON boundary；Monaco 属宿主可选增强。

### 11.6 Blueprint authoring parity

- Engine 提供 full-workspace Blueprint authoring surface，视觉上复用同一 toolbar/panel/status 语言。
- 首版基于 canonical rule/condition 构建 trigger、condition、action 和 comment-like annotation
  视图；节点/连线只是 authoring projection，不成为第二份 runtime truth。
- 必须提供 selection、search insertion、connection validation、zoom 25%..200%、fit、minimap、
  align/distribute、node config、diagnostics、simulation log、context menu 和 component locate/filter。
- 若 canonical contract 不持久化节点 layout，使用确定性 auto-layout；不得把私有 layout 字段写进
  document。未来持久化 layout 需要独立 ADR/Spec。
- Blueprint UI 只调用 Runtime Spec 的 parser/compiler/fake runtime；Engine 不复制 evaluator 或执行
  host action。

### 11.7 Preview、文件与快捷键

- Project mode Preview 只针对最近成功 save 的 projectId/revision 发出 host preview request，不把
  unsaved in-memory document 伪装成已保存预览。
- Direct document mode 可在 Designer 内切到同实例 Viewer preview；退出后恢复 viewport/selection。
- 提供 canonical JSON import/export。Import 在 preview/confirm 后以一个 transaction 替换 document；
  不承担 Nebula migration，legacy 文件继续走独立 importer。
- 所有命令来自单一 shortcut registry，按 global/canvas/blueprint scope 仲裁；输入控件保留浏览器
  undo、selection 和文本快捷键。
- 目标是覆盖 Nebula 可对应的 file/edit/view/component/align/help/tool/ui 命令，而不是机械追求固定
  数量；未实现能力不注册误导性快捷键。

### 11.8 Visual 与 workflow 门禁

- 在 1024x640、1440x900、1920x1080 验证 toolbar/status/ruler/panel/handle 尺寸，误差不超过 1px，
  无 body scroll 或不一致 overlap。
- 1440x900 light/dark shell 使用 Base Screen 自有 screenshot golden，`maxDiffPixelRatio <= 0.005`。
- Materials、Layers、selected transform、四 Property tabs、Canvas settings、context menu、conflict 和
  preview workflow screenshot 几何误差不超过 2px，diff ratio 不超过 0.01。
- Blueprint empty/populated/config/diagnostics/log/search/context menu 在 1440x900 的 diff ratio 不超过
  0.01。
- 390x844 与 768x1024 只验收窄屏 warning、dialog containment 和无 runtime failure；Viewer preview
  另在 390x844、412x915 验证居中缩放和无 body overflow。
- Nebula 对比截图仅可作为本地、非提交审计输入；仓库只提交 Base Screen 独立生成的 goldens 和
  数值结果。视觉 diff 不是复制未授权资产的许可。

## 12. ADDED Requirements

### R1：Dirty baseline

当 document 相对最近成功 load/save baseline 改变或 undo 回 baseline 时，Designer SHALL 只在 dirty
布尔值变化时发出事件，并保持 revision 不变直到有效 adapter response。

### R2：可取消项目操作

当 project replace/unload/disconnect/dispose 发生时，Designer SHALL abort pending load/save/publish，
并忽略所有迟到 response。

### R3：显式 publish/conflict/retry

当 publish 不可用、document dirty、adapter conflict 或 mutation failure 时，Designer SHALL 返回
稳定诊断并要求显式后续动作，不自动 save、覆盖或重放 mutation。

### R4：多选变换

当用户多选并 move/resize/rotate 时，Designer SHALL 遵守 Material capability、锁定和相对几何，
并只提交一个 transaction/history entry。

### R5：Marquee 与 Layers

当用户通过 marquee 或 Layers 改变 selection/tree 时，Designer SHALL 使用同一个 Core interaction
和 hierarchy 状态，不维护相互漂移的副本。

### R6：Group/reparent 与布局命令

当用户 group、ungroup、reparent、align 或 distribute 时，Designer SHALL 保持 tree 合法和视觉
位置，并使整个操作一次 undo。

### R7：Clipboard

当用户 paste 时，Designer SHALL 生成唯一 id、重写内部 parentId、排除 runtime/project 状态，且
切换项目后旧 clipboard 不可用。

### R8：Schema Property Panel

当用户编辑 Manifest 声明字段时，Designer SHALL 在 command 前验证完整 props；非法输入不得改变
document/history/Renderer。

### R9：Nebula-compatible shell

Designer SHALL 以 §11 的区域、尺寸、主题、密度、状态和窄屏规则实现独立工作台，并通过 geometry
与 screenshot 门禁；不得复制 Nebula CSS/asset/config。

### R10：Nebula-compatible authoring workflow

当对应 Material capability 可用时，Designer SHALL 提供七工具、ruler/guide/grid/smart-guide、
select/create/duplicate/group、Layers、Properties、history、clipboard 和 scoped shortcuts 工作流。

### R11：Nebula-compatible integration surfaces

当 Runtime Spec 和 host capability 可用时，Designer SHALL 提供 static/host-resource 配置、
Blueprint authoring projection、interaction mode、preview request 和 canonical import/export；缺失
capability 时界面必须明确 disabled 或 absent，不得用宿主专有 fallback。

## 13. Test Matrix

| 领域 | 必测行为 |
| --- | --- |
| Adapter contract | capability 一致性、response parse、opaque revision、throw/reject 最小披露 |
| Project controller | generation、abort、mutation serialization、late response、retry timer、dispose |
| Baseline | load clean、edit dirty、undo clean、save 中再编辑、publish 不清未保存编辑 |
| Conflict | 保留 local/history/selection、reload confirm、continue、不 force overwrite |
| Selection | click/modifier/marquee、hidden/locked、focused reconcile、双实例隔离 |
| Transform | 8 resize handles、rotate、modifiers、多选几何、capability、cancel、单历史 |
| Hierarchy | group/ungroup/reparent、坐标转换、循环拒绝、children capability |
| Layout | 六种 alignment、两种 distribution、locked reference、原子 transaction |
| Layers/Clipboard | tree/reorder/status、双向 selection、id/reference rewrite、project 清理 |
| Property | control/schema 映射、enum、非法 draft、完整 props validation、单历史 |
| Parity shell | 三种 desktop viewport 几何、light/dark screenshot、panel resize/collapse、窄屏 warning |
| Viewport/tools | 10%-500%、fit、ruler/guides/grid/smart guides、七工具、临时 Hand、4px create threshold |
| Integration UI | Data/Interaction/Events tabs、Blueprint workspace、preview request、canonical import/export、scope shortcuts |

Core 纯函数和 Engine controller 使用 Vitest；真实 Pointer Events、Shadow DOM、keyboard、project races
使用独立 Designer Playwright harness。该 harness 不承担 sandbox/resource/framework/importer 测试。

## 14. 完成定义

- Project Lifecycle ADR 已接受，Contracts adapter/result/diagnostic 与本 Spec 一致。
- load/save/publish、cancel、conflict、dirty baseline 和 retry 均有单元与浏览器 race 测试。
- resize/rotate、多选、marquee、group/reparent、alignment/distribution、Layers、clipboard 和
  Manifest Property panel 可在同一 Designer 中完成。
- 所有 persistent high-level action 通过 Core command/transaction，只产生一个 history entry。
- pointer/project cancellation 和迟到结果不会污染新 document、revision、baseline 或 DOM。
- 两个 Designer 实例的 selection、history、clipboard、project operation 和 UI 状态完全隔离。
- P0-P2 parity matrix 已完成，截图/geometry/workflow evidence 满足 §11.8；所有已知有意差异有记录。
- Nebula 样式与功能只作为可观察兼容基准，发布产物不包含其源码、CSS、配置、资产或截图。
- 本 Spec 未修改 Remote Sandbox、Host Resource、Blueprint schema/compiler/runtime、plugin
  contribution、framework bridge 或 importer 契约。
- 定向检查及 `pnpm verify:m0` 全部通过，且不存在未记录的公共 API 偏离。

# Designer Authoring And Project Lifecycle Spec

> 状态：设计中
> 最近更新：2026-08-04
> 定位：增量冻结 Designer 完整编辑交互与 load/save/publish 项目生命周期，不扩展 runtime/plugin 语义
> 依据：[ADR-0006](../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[Designer Engine Spec](../designer-engine/spec.md)、[Core Domain Spec](../core-domain/spec.md)、[Plugin Core Contract Spec](../plugin-core-contract/spec.md)
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

## 2. 生效前置

- 新增 Project Lifecycle ADR，冻结 `ScreenProjectAdapter` 的 publish、AbortSignal、冲突和 retry
  所有权；ADR-0006 只确认 adapter 显式存在，没有定义这些公共语义。
- Public adapter/result/diagnostic 变更同步 Contracts Foundation Spec；不得只在 Engine 私有类型中
  增加兼容分支。
- grouping 若需要自动创建容器，宿主必须显式配置已启用且 `designCapabilities.children=true` 的
  `groupMaterialType`；不得向 canonical document 偷渡 synthetic node。
- 本 Spec 评审生效后才能实施；现有 load/save 行为在此之前保持原样。

## 3. 目标

- 增加 resize/rotate handle、多选、marquee、group/reparent、alignment/distribution、Layers、
  clipboard 和 schema-driven property panel。
- 所有高层编辑动作通过 Core command/transaction，并只提交一个 history entry。
- 建立可取消、generation-safe 的 load/save/publish controller。
- 用 canonical baseline 精确跟踪 dirty，使 undo 回到保存点时重新 clean。
- 显式处理 conflict 和 retry，不自动覆盖远端或自动重放 mutation。

## 4. 非目标

- 不修改 Remote Sandbox、Host Resource timeout/cancel、Blueprint schema/compiler 或 plugin
  contribution runtime projection。
- 不实现 React/Vue material bridge 或 installed-tarball consumer。
- 不把 Nebula importer 变成 Designer UI，也不允许 importer 直接 save/publish。
- 不引入 React/Vue、第三方画布框架、全局 Store 或模块级 current session。
- 不实现多人实时协作、merge editor、force overwrite、系统剪贴板或移动端编辑承诺。
- 不修改 Renderer 的 Material DOM/model/event/resource 生命周期。

## 5. 所有权与并行边界

| 领域 | 本 Spec 拥有 | 只消费 |
| --- | --- | --- |
| Contracts | Project Adapter request/result/capability 与 project diagnostic | Host Resource/Blueprint ports |
| Core | 编辑 transaction、selection/geometry 的缺口增量 | Canonical parser 与 runtime capability index |
| Engine | Designer session、UI、history、clipboard、project controller | Material Catalog/Manifest、Renderer |
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
- Ctrl/Cmd+V 为所有 node 生成新 id，重写内部 parent 引用并偏移 10 x 10。
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

## 11. ADDED Requirements

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

## 12. Test Matrix

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

Core 纯函数和 Engine controller 使用 Vitest；真实 Pointer Events、Shadow DOM、keyboard、project races
使用独立 Designer Playwright harness。该 harness 不承担 sandbox/resource/framework/importer 测试。

## 13. 完成定义

- Project Lifecycle ADR 已接受，Contracts adapter/result/diagnostic 与本 Spec 一致。
- load/save/publish、cancel、conflict、dirty baseline 和 retry 均有单元与浏览器 race 测试。
- resize/rotate、多选、marquee、group/reparent、alignment/distribution、Layers、clipboard 和
  Manifest Property panel 可在同一 Designer 中完成。
- 所有 persistent high-level action 通过 Core command/transaction，只产生一个 history entry。
- pointer/project cancellation 和迟到结果不会污染新 document、revision、baseline 或 DOM。
- 两个 Designer 实例的 selection、history、clipboard、project operation 和 UI 状态完全隔离。
- 本 Spec 未修改 Remote Sandbox、Host Resource、Blueprint、plugin contribution、framework bridge
  或 importer 契约。
- 定向检查及 `pnpm verify:m0` 全部通过，且不存在未记录的公共 API 偏离。

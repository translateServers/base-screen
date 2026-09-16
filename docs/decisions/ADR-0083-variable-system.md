# ADR-0083: 变量体系

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0054（变量面板入口、静态值编辑、复制、重名与引用删除保护、单条历史的撤销语义）、ADR-0067（DataV 启发的早期全局变量模型：`static | host`、按名称寻址、目录与预览边界；该模型已被取代，只作演化记录）、ADR-0068（现行变量体系：三类来源、稳定 ID 引用、完整配置字段、Blueprint 变量节点、运行时变量句柄与一次性迁移）；被吸收记录已随本次合并移除，内容只在 git 历史中保留
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、ADR-0063、ADR-0076

## 背景

Screen Document 原生支持全局变量，数据绑定面板与 Blueprint（`set-variable` 动作、条件表达式变量）都在消费变量，但 Designer 最初没有任何变量管理入口——变量清单只能由宿主整体注入，用户在界面中看不到变量列表、无法新建/重命名/删除变量或编辑静态值。

ADR-0054 补上了面板入口与静态变量管理，但当时 host 变量只读、按名称引用、公共契约零变化。ADR-0067 借鉴了 DataV 的目录与预览体验，却仍保留 `static | host` 与按名称寻址，并明确排除了 DataV 的数据源请求、URL 来源、过滤器配置、受控模式、自动更新与变量蓝图节点。该取舍不能满足“全局变量直接按 DataV 行为实现”的产品要求，因此 ADR-0068 做了语义对齐：变量以稳定 ID 寻址，来源收敛为三类，配置字段、蓝图节点与运行时句柄与 DataV 同形，破坏性变更只提供一次性迁移。本文件把这三份记录收敛成一份现行表述：0067 的模型只作演化记录，0054 的面板与撤销语义继续有效。

## 决策

### 1. 变量以稳定 ID 寻址

每个变量保存不可变 `id`、可改 `name`、可选 `description` 与 `initialValue`。组件参数、组件变量数据源、Blueprint 触发器/表达式/动作与运行时 API 全部引用 `variableId`；重命名只改展示名，不重写引用。ADR-0067 的按名称寻址、别名同步与按名称原子重命名不再有效；引用不复位于 `name`，`variableName` 形式的引用不是现行形态。

### 2. canonical 来源与配置字段与 DataV 一致

`ScreenVariable` 采用三类来源 `static | data-source | url-query`：

```ts
interface ScreenVariableBase {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly initialValue: ScreenJsonValue;
}
interface ScreenDataSourceVariable extends ScreenVariableBase {
  readonly type: 'data-source';
  readonly sourceId: string;
  readonly processorId?: string;
  readonly controlled: boolean;
  readonly autoUpdate?: { readonly intervalSeconds: number };
}
interface ScreenUrlQueryVariable extends ScreenVariableBase {
  readonly type: 'url-query';
  readonly sourceId: string;
  readonly processorId?: string;
  readonly controlled: boolean;
}
```

动态来源保存宿主管理的 `sourceId`、可选过滤器处理标识 `processorId` 与 `controlled`；`data-source` 还可保存 `autoUpdate.intervalSeconds`（整秒，1..86400）。文档不保存 URL、SQL、请求头、凭证或过滤代码。`static | host` 不再是有效来源分类。

### 3. 配置表单按 DataV 字段组织

Designer 在 Blueprint 左侧「全局变量管理」提供行内创建与编辑，显示变量名、描述、来源、初始值、过滤器、数据响应结果、受控模式与自动更新；来源下拉固定为三种。变量行默认折叠，悬停显示编辑、加入蓝图、重命名、复制和删除动作，右侧显示使用次数。Enter 提交、Escape 取消，焦点与滚动轨道保持稳定。

### 4. 受控模式具有运行语义

动态变量开启 `controlled` 后，Blueprint 初始快照使用 `null`，不使用 `initialValue`；当前值由宿主解析或交互写入。未受控时 `initialValue` 可作为解析完成前的回退。

### 5. 过滤、响应与自动更新保持宿主边界

`processorId` 指向宿主管理的过滤器。作者预览通过 `authoring-preview` 返回数据响应结果且不持久化。自动更新频次进入严格文档与宿主请求，但 Engine 不建计时器；宿主按该配置调用 `refreshVariables`，从而保留租户、权限、可见性与后台调度控制。`refreshVariables({ variableIds?, traceId? })` 省略 ID 时刷新当前文档全部动态变量，同一目标并发调用被合并，取消与 generation guard 拒绝迟到结果。

### 6. 变量是 Blueprint 一等节点

语义图包含 `variable` 节点、稳定 `variable:<id>` 节点 ID、`data-updated | request-state` 事件，以及导入变量和请求组件数据动作。由文档引用推导的依赖边不可删除；作者建立的普通规则边可删除。ADR-0067 的“关联全局变量”虚线模块不再作为第二套作者入口。

### 7. 运行时变量句柄与级联保护

Viewer 与 Designer 暴露 `getVariable(id).value`、`.set(value)`、`.onChange(listener)`。写入经过 JSON 校验、Renderer 原子应用、变量事件级联和 32 层循环保护；动态解析变化也触发监听与 `data-updated`。宿主变量值按 1 MiB JSON 预算校验，超限或非法失败关闭。

### 8. 五种使用方式均有边界内映射

静态值直接消费；异步值由动态变量端口解析；URL 参数由 `url-query` 来源的宿主解析；交互参数通过 Blueprint 变量事件与赋值动作传递；过滤器通过 `processorId` 由宿主执行。API/SQL 中的变量插值仍由宿主资源实现完成。

### 9. 宿主变量目录与作者预览分权

作者面通过 `ScreenHostVariableCatalogPort` 的 `list` / `describe` 选择动态来源：`list` 请求含 `query`、`sourceType`、可选 `cursor`、`limit` 与 `signal`，返回 `ScreenHostVariablePage { items, nextCursor? }`（分页上限 50），条目为 `ScreenHostVariableSummary { sourceId, sourceType, name, description }`；`describe` 返回 `ScreenHostVariableDescriptor`，在上者基础上增加 `previewable`。启用 `variableCatalog` capability 必须同时启用并提供 `variables` 解析端口。`ScreenHostVariableRequest` 必须携带 `purpose`：运行期使用 `runtime`，作者预览使用 `authoring-preview`；宿主可按变量、租户与权限拒绝预览。预览值先过 1 MiB JSON 预算，只在会话内显示至多 8 KiB 的摘要，不进入文档或历史；失败、超时、取消和迟到响应不得暴露值。目录返回 `sourceId` 而非按名称寻址，是 ADR-0067 目录模型的现行改写形态。

### 10. 面板入口、复制、删除保护与撤销语义

左侧面板提供「变量」Tab（与「物料」「图层」并列）。静态变量支持新建（名称 + JSON-safe 值）、重命名、编辑值与删除；行内编辑复用既有 JSON 草稿解析语义，非法 JSON 拒绝并诊断、不产生事务。所有变更复用既有 `replace-variables` 命令（整组替换，Core 侧失败关闭校验），恰产生一条历史记录，undo/redo 整体往返。删除或重命名前检查文档内引用——组件数据源参数引用、Blueprint `set-variable` 目标与条件/动作表达式中的变量引用；被引用时拒绝并返回诊断，不做级联清理。新建/重命名后的名称必须与既有变量名互不相同（UI 层失败关闭的名称保护）。复制只预填新建表单，不复制引用。数据绑定下拉与蓝图面板从 `document.variables` 派生，替换后自动反映。

### 11. 破坏性契约变更只提供一次性迁移

不保留 `host`、`value`、按名称引用或兼容分支。仓库提供 `scripts/migrate-datav-global-variables.mjs`，确定性生成稳定 ID 并改写全部文档引用；重名、未知引用或非法旧形态失败关闭。不引入版本字段、双解析器或运行时降级分支；迁移后只有一个当前形态。

## 后果

- 作者看到的变量来源、字段、管理动作、响应预览、蓝图节点与运行时读写方式与 DataV 对齐；rename 不再触碰引用，引用保护与单条历史的撤销语义继续有效。
- 契约是破坏性的：旧 `static | host` 文档、按名称引用与按名称重命名不再工作，必须经一次性迁移；重名或未知引用会阻塞而非被猜测修复。
- 真实 URL 读取、SQL/API 请求、凭证、过滤代码与轮询调度继续由宿主执行；Base Screen 维持 ADR-0027 的宿主边界，不在 Engine 内重复实现数据平台、凭证系统或后台调度器。
- 明确推迟/非目标：不实现 DataV 的 URL/SQL/API 变量来源、任意 JavaScript 过滤器或 Engine 内轮询/订阅；不在目录或预览响应中暴露凭证、租户对象、请求配置或未经裁剪的业务数据；不新增包、生产依赖、后端、缓存或跨实例共享状态；不做变量引用的级联清理（拒绝而非级联）；不改变 Blueprint 节点类型、条件语言或复杂 ECharts/领域配置的宿主归属；跨实例共享、运行时求值与持久化归宿主。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0054 | 左侧「变量」Tab 入口；静态变量行内新建/重命名/编辑值/删除与 JSON 草稿解析语义；复用 `replace-variables` 单条历史与 undo/redo；引用删除保护与 UI 层名称保护；数据绑定与蓝图派生联动；复制只预填表单 | 部分取代（按名称变量引用、`host` 变量只读与“公共契约零变化”结论由 ADR-0068 取代；面板与撤销语义保留） |
| ADR-0067 | 宿主变量目录与作者预览的边界（`purpose` 分权、目录分页上限 50、预览容量与失败不暴露值）、`refreshVariables` 显式刷新、变量管理面板动作 | 已取代（`static \| host`、别名同步、按名称原子重命名、搜索/类型筛选与“不新增 Blueprint 节点”结论失效；仅保留历史背景，其目录与预览边界已并入 ADR-0068 的现行形态） |
| ADR-0068 | 稳定 ID 寻址；三类来源 `static \| data-source \| url-query` 与完整配置字段；受控模式运行语义；过滤器/响应/自动更新宿主边界；Blueprint `variable` 节点与 `variable:<id>`；运行时变量句柄；五种使用方式映射；一次性迁移 | 现行且仍生效（本文件为其主线收敛表述） |

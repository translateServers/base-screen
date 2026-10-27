# ADR-0091：蓝图关系模型与设计表达

> 状态：已接受  
> 日期：2026-10-27  
> 关联：ADR-0027（轻量基座与宿主处理）、ADR-0067（事件蓝图工作台与宿主画布槽位）、
> ADR-0076（宿主动作与能力授权）、ADR-0084（插件贡献词汇与信任）。
> 历史 ADR 正文只存在于 git 历史（docs 树已退役），此处只引用编号与主题。

> 2026-10-27 评审通过。Phase 1（契约/核心/迁移）与 Phase 2（引擎画布/三端宿主画布）
> 已落地；剩余文档与门禁随本 ADR 同批完成。

## 背景

蓝图最初按「物料事件 → 条件 → 动作」编排：canonical 文档持久化 `blueprint.rules`，每条规则
只有一个触发源与顺序动作列表。它足以表达点击显隐、写变量这类运行时联动，却把蓝图限制成
事件编辑器：

- 组件之间的静态关联（详情、分组、下钻）没有落点；
- 数据共享只能藏在动作里，无法以组件关联的形式阅读；
- 画布以规则/条件/动作为节点，组件反而是附属；
- 文档持久化的规则是画布投影的私有形状，宿主和其他工具无法稳定消费。

产品定位调整为：**画布是同一份设计的空间表达，蓝图是它的语义/结构表达**。两者共享
`ScreenDocument`、事务与历史；蓝图应直接表达组件之间的关联。

## 决策

### 1. 一等关系模型

`ScreenDocument.blueprint` 改为：

```ts
interface ScreenBlueprint {
  readonly relations: readonly ScreenBlueprintRelation[];
  readonly layout?: ScreenBlueprintLayout;
}
```

关系分两类：

- `behavior`：有运行时行为。`source` 是组件事件或变量事件；`target` 是组件、变量或宿主；
  `effect` 是显隐、请求组件数据、设置变量、请求变量、触发宿主事件或执行宿主动作；
  `condition`、`requiredCapabilities` 与既有事件规则语义一致。
- `semantic`：只表达设计关联。组件到组件，`role` 为 `related | detail | group | drill-down`，
  **没有运行时行为**。

行为关系的一条关系对应一个效果；条件的多个效果用多条同源同条件的关系表达。

### 2. 规则由关系派生，绝不持久化

运行时编译、能力检查与 trace 继续消费 `ScreenBlueprintRule[]`，但它由
`deriveScreenBlueprintRules(blueprint)` 在内存中派生：

- 连续且 source（组件/变量 + 事件）与 canonical condition 完全相同的关系合并为一个规则；
- 规则 id 取组内第一条关系 id；动作顺序即关系顺序；
- 非连续分组（中间插入了不同条件的关系）保持分组边界，避免改变执行顺序；
- 派生函数带 WeakMap 缓存，纯读、无副作用。

因此 `blueprint.rules` 不是合法的持久化字段；任何写回都会触发严格解析失败。
`blueprint.rules` 只作为迁移输入存在。

### 3. 迁移是宿主的显式职责

`migrateScreenDocument(input)` 在解析前对原始 JSON 做一次一等的 rules → relations 预处理：

- 每条规则按动作拆成多条 behavior 关系，`relation-<n>` 依次分配；
- 保留顺序、条件、能力声明与可用 layout；丢弃没有运行时等价物的 condition/action/unconnected
  布局位置；
- 幂等：已含 `relations` 的文档原样解析；
- 无法安全识别的旧形状保持原样，让严格解析失败关闭，不做部分迁移。

宿主在读取已存储文档时必须调用该函数（示例三端 project adapter 已接入）；新文档直接使用
relations，不写规则。

### 4. 画布投影

引擎图投影（`buildDesignerBlueprintGraph`）以组件为中心：

- 节点：全部投影组件（上限 200）+ 被引用/读取/固定布局的变量 + 单例宿主节点；
- 边：behavior relation、semantic relation、containment（由 `component.parentId` 只读生成）、
  dependency（变量被组件读取、条件读取变量）；
- 节点携带 `inbound/outbound/read/write/exit` 计数、容器层级与事件可用性；
- `blueprint.layout` 只存节点位置与视口；模式、选择、临时拖动与 trace 高亮属 session。

作者面分类由关系形状派生：

- 交互联动（组件事件 → 组件/可见性/请求数据）；
- 数据共享（写变量、变量事件 → 下游、组件读取变量）；
- 业务出口（组件/变量 → 宿主，`emit-host-event` / `host-action`）；
- 语义关联（semantic relation）；
- 结构（containment，只读，不允许单独删除）。

连接矩阵：组件/变量事件可连到任意组件、变量或宿主的 `relation:in`；组件的
`semantic:out` 只能连到组件并生成 semantic relation；宿主节点单例，由「添加业务系统节点」插入。
能力未授权的物料事件在作者面不可用，编译按能力缺失失败关闭。

### 5. 设计表达与宿主边界

默认中央画布与宿主画布消费同一套公开 state/command；本 ADR 固定视觉词汇的语义（组件/变量/
宿主卡片、relation/semantic/containment/dependency 边、贴纸标签），具体像素与主题由各自画布
决定：

- 引擎默认画布：中性设计令牌、20px 点阵、208px 组件卡、圆角正交连线与贴纸标签；
- 宿主画布仍可覆盖图形渲染、布局算法与手势，但必须提供等价语义端口与标签，否则作者无法
  建立/阅读关系；
- 宿主不得依赖 `blueprint.rules`、引擎私有 Shadow DOM 或未声明的 UI 注入点。

自动布局是会话默认值（只读变量在左、组件 2/3 列、业务系统在右），用户拖动后写入 layout；
「自动布局」是显式可撤销命令。

## 后果

- `blueprint.rules` 从公共文档契约中移除；仍按旧形状存储文档的宿主必须在读取时迁移。
- `ScreenBlueprintRule` 仍作为运行时派生类型公开，但不再是持久化入口；规则 id 不再稳定对应
  一条持久化实体（取组内首条关系 id）。
- 语义关系不参与运行时；它们只影响作者面阅读，不产生副作用。
- 容器层级不新增文档字段，结构关系由 `parentId` 只读派生；结构边不可删除，需在画布/图层面板
  修改父子关系。
- 三端示例宿主画布与 project adapter 已按新模型更新；旧示例数据在加载时迁移，保存后落新形态。

## 实施切片

1. contracts：类型、schema、严格键、引用校验、限制、JSON Schema 黄金产物、迁移与测试。
2. core：派生规则编译、replace-blueprint 与 runtime dispatch 适配。
3. engine：图投影、关系 CRUD、检查器、库、画布协议、默认画布与视觉收口。
4. examples/harness：三端宿主画布、示例文档与断言、旧文档加载迁移。
5. 文档/门禁：本 ADR、设计说明、changeset、verify 链路。

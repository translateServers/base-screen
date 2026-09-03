# ADR-0068：DataV 全局变量语义对齐

> 状态：已接受
> 日期：2026-09-03
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0063](./ADR-0063-designer-blueprint-workbench-shell.md)、
> [ADR-0067](./ADR-0067-datav-inspired-global-variables.md)

## 1. 背景

ADR-0067 只借鉴了 DataV 的目录与预览体验，保留了 `static | host` 和按名称寻址，明确排除了
DataV 的数据源请求、URL 来源、过滤器配置、受控模式、自动更新配置和变量蓝图节点。该取舍不能满足
当前“全局变量直接按 DataV 7.0 行为实现”的产品要求。

DataV 7.0 官方文档确认：全局变量拥有静态值、数据源请求、URL 查询条件三种来源；配置项包含变量名、
描述、初始值、过滤器、数据响应结果、受控模式和自动更新；变量可重命名、复制、删除、加入蓝图，并可
用于静态值、异步引用、URL 参数、交互事件参数和过滤器引用。依据见
[全局变量配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/global-variable-configuration)、
[管理全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-global-variables)与
[使用全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/use-global-variables)。

Base Screen 仍是可嵌入设计器基座，因此“对齐”指 canonical 语义、作者操作、蓝图投影和宿主 API 对齐；
真实 URL 读取、SQL/API 请求、凭证、过滤代码和轮询调度继续由宿主执行。

## 2. 决策

1. **变量以稳定 ID 寻址。** 每个变量保存不可变 `id`、可改 `name`、可选 `description` 与
   `initialValue`。组件参数、组件变量数据源、Blueprint 触发器/表达式/动作和运行时 API 全部引用
   `variableId`；重命名只改展示名，不重写引用。

2. **canonical 来源与 DataV 一致。** `ScreenVariable` 采用 `static | data-source | url-query`。
   动态来源保存宿主管理的 `sourceId`、可选过滤器处理标识 `processorId` 与 `controlled`；
   `data-source` 还可保存 `autoUpdate.intervalSeconds`。文档不保存 URL、SQL、请求头、凭证或过滤代码。

3. **配置表单按 DataV 字段组织。** Designer 在 Blueprint 左侧“全局变量管理”提供行内创建与编辑，
   显示变量名、描述、来源、初始值、过滤器、数据响应结果、受控模式和自动更新；来源下拉固定为三种。
   变量行默认折叠，悬停显示编辑、加入蓝图、重命名、复制和删除动作，右侧显示使用次数。Enter 提交、
   Escape 取消，焦点与滚动轨道保持稳定。

4. **受控模式具有运行语义。** 动态变量开启 `controlled` 后，Blueprint 初始快照使用 `null`，不使用
   `initialValue`；当前值由宿主解析或交互写入。未受控时初始值可作为解析完成前的回退。

5. **过滤、响应和自动更新保持宿主边界。** `processorId` 指向宿主管理的过滤器；作者预览通过
   `authoring-preview` 返回数据响应结果且不持久化。自动更新频次进入严格文档与宿主请求，但 Engine 不建
   计时器；宿主按该配置调用 `refreshVariables`，从而保留租户、权限、可见性和后台调度控制。

6. **变量是 Blueprint 一等节点。** 语义图包含 `variable` 节点、稳定 `variable:<id>` 节点 ID、
   `data-updated | request-state` 事件，以及导入变量和请求组件数据动作。由文档引用推导的依赖边不可删除；
   作者建立的普通规则边可删除。旧“关联全局变量”虚线模块不再作为第二套作者入口。

7. **运行时 API 与 DataV 二开能力同形。** Viewer 与 Designer 暴露
   `getVariable(id).value`、`.set(value)`、`.onChange(listener)`。写入经过 JSON 校验、Renderer 原子应用、
   变量事件级联和 32 层循环保护；动态解析变化也触发监听与 `data-updated`。

8. **五种使用方式均有边界内映射。** 静态值直接消费；异步值由动态变量端口解析；URL 参数由
   `url-query` 来源的宿主解析；交互参数通过 Blueprint 变量事件与赋值动作传递；过滤器通过
   `processorId` 由宿主执行。API/SQL 中的变量插值仍由宿主资源实现完成。

9. **破坏性契约变更只提供一次性迁移。** 不保留 `host`、`value`、按名称引用或兼容分支。仓库提供
   `scripts/migrate-datav-global-variables.mjs`，确定性生成稳定 ID 并改写全部文档引用；重名、未知引用或
   非法旧形态失败关闭。

## 3. 兼容性与取代关系

- 本 ADR 完全取代 ADR-0067 的 `static | host`、别名同步、按名称原子重命名、搜索/类型筛选和“不新增
  Blueprint 节点”结论；ADR-0067 只保留历史背景。
- 本 ADR 取代 ADR-0054 的按名称变量引用；变量入口、复制、删除保护和撤销语义继续有效。
- 探索阶段不引入版本字段、双解析器或运行时降级分支；迁移后只有一个当前形态。

## 4. 结果

作者看到的变量来源、字段、管理动作、响应预览、蓝图节点和运行时读写方式与 DataV 7.0 对齐；Base
Screen 同时维持 ADR-0027 的宿主边界，不在 Engine 内重复实现数据平台、凭证系统或后台调度器。

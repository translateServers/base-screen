# DataV 全局变量调研记录

> 状态：已完成并归档
> 日期：2026-09-01
> 初次结论：[ADR-0067](../../../decisions/ADR-0067-datav-inspired-global-variables.md)（已取代）
> 复核结论：[ADR-0068](../../../decisions/ADR-0068-datav-global-variables.md)（2026-09-03）

## 调研范围

本次只研究阿里云 DataV 官方文档中的全局变量作者体验与使用路径：

- [全局变量配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/global-variable-configuration)
- [管理全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-global-variables)
- [使用全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/use-global-variables)
- [全局变量案例](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/example-of-using-global-variables)
- [组件交互配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/widget-interaction-configuration)

调研记录只描述外部产品事实与 Base Screen 的取舍，不复制 DataV 实现、代码或视觉资产。

## DataV 可见能力

1. 变量配置包含名称、描述、来源、初始值、过滤器、响应结果、受控模式和自动更新。
2. 来源覆盖静态值、数据源请求和 URL 查询条件；数据源变量可以引用其他变量，API/SQL 使用变量
   插值，响应结果可手动刷新查看。
3. 变量支持重命名、复制、删除和添加到蓝图；删除前要求先取消引用。
4. 组件交互可把事件参数更新到变量；变量又可进入组件数据接口、蓝图逻辑和过滤器，形成跨组件联动。
5. 自动更新允许配置轮询频次；受控模式开启后初始值不再主导当前值。
6. 旧“关联全局变量”模块已被交互事件覆盖且官方不再推荐；当前路径以交互事件更新变量。

## 初次有界映射（已取代）

| DataV 体验 | Base Screen 采用方式 | 边界理由 |
| --- | --- | --- |
| 名称与描述 | 文档变量增加可选描述 | 当前文档内的作者信息 |
| 静态来源 | 保留 `static` JSON 值 | 已有 canonical 能力 |
| 数据源/URL 来源 | 映射为宿主目录中的 opaque `variableId` | 查询、URL、凭证和权限归宿主 |
| 响应结果预览 | `authoring-preview` + 1 MiB 校验 + 8 KiB 会话摘要 | 不把敏感值写入文档/历史 |
| 受控/自动更新 | 宿主维护状态并调用 `refreshVariables` | Engine 不拥有轮询或订阅 |
| 重命名/复制/删除 | Core 原子重命名；复制预填；引用删除拒绝 | 保持引用完整和单历史 |
| 事件写变量 | 复用 Blueprint 结构化表达式 | 不引入 JavaScript 或字符串表达式 |
| 查询引用变量 | 继续使用 host-resource 参数表达式 | 资源解析与数据处理归宿主 |

## 2026-09-03 复核与实施映射

复核确认初次方案遗漏了 DataV 的核心 canonical 语义。当前映射改为：

| DataV 能力 | Base Screen 当前映射 | 宿主边界 |
| --- | --- | --- |
| 静态值、数据源请求、URL 查询条件 | `static | data-source | url-query` 三类变量 | 动态来源只保存 opaque `sourceId` |
| 名称、描述、初始值 | 稳定 `id` 与可编辑展示字段 | 无宿主执行依赖 |
| 过滤器 | 可选 `processorId` | 过滤代码与执行归宿主 |
| 数据响应 | `authoring-preview` 有界会话摘要 | 不持久化响应、凭证或错误正文 |
| 受控模式 | `controlled`；开启后运行快照不使用初始值 | 当前值由宿主解析或交互写入 |
| 自动更新 | `autoUpdate.intervalSeconds` 严格配置 | Engine 不建计时器，宿主调度刷新 |
| 管理与加入蓝图 | 编辑、重命名、复制、删除、使用次数、变量节点 | 中央图形渲染与手势仍归宿主 |
| 五种使用方式 | 组件参数、变量数据源、URL 来源、Blueprint 事件/动作、过滤器 ID | API/SQL 插值与 URL 读取归宿主 |
| 二次开发读写 | `getVariable(id).value/.set/.onChange` | 写入只接受 JSON-safe 值 |

## 安全与产品结论

- 目录只暴露安全摘要；`variableId` 是稳定 opaque 标识，不是 URL 或查询文本。
- `previewable` 只表示宿主允许发起预览，最终授权仍由 `purpose: 'authoring-preview'` 的解析结果决定。
- 预览失败不显示宿主错误正文或旧值；数据源测试参数不完整时不发资源请求。
- 动态更新不在 Engine 建立计时器、后台任务或缓存；宿主可按自己的路由、权限和生命周期调度刷新。
- DataV 的任意过滤器、SQL/API 编辑器和 URL 注入不进入 Base Screen；复杂编辑器继续由宿主拥有。

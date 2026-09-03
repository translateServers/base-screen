# ADR-0067：DataV 启发的全局变量完善

> 状态：已取代
> 日期：2026-09-01
> 取代：[ADR-0068](./ADR-0068-datav-global-variables.md)
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、
> [ADR-0054](./ADR-0054-designer-variable-management.md)、
> [ADR-0063](./ADR-0063-designer-blueprint-workbench-shell.md)

## 1. 背景

现有 Screen Document 已有 `static | host` 两种变量，但变量没有描述，host 变量只能由宿主整体
注入，作者无法从受控目录选择或预览；引用中的变量也不能安全重命名。运行期 host 变量只在初始
加载和数据刷新时解析，宿主状态变化缺少专门的差量刷新入口。

阿里云 DataV 的全局变量提供名称、描述、静态值/数据源请求/URL 来源、响应预览、受控模式、自动
更新以及重命名、复制、删除，并可在组件交互、数据查询和蓝图中传递。相关官方资料见
[全局变量配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/global-variable-configuration)、
[管理全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-global-variables)、
[使用全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/use-global-variables)和
[案例演示](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/example-of-using-global-variables)。

DataV 的产品体验可作为作者工作流参考，但 URL、SQL/API 查询、凭证、过滤器和轮询属于数据平台
能力，不符合 Base Screen 的轻量宿主边界。

## 2. 决策

1. **保持单一 canonical 形态。** `ScreenVariable` 仍只有 `static | host`。文档保存静态 JSON
   值或稳定 `variableId`，不保存 URL、SQL、请求头、凭证、过滤器、轮询或订阅配置。

2. **描述进入文档契约。** `ScreenStaticVariable` 与 `ScreenHostVariable` 增加可选
   `description`；提供时最多 4096 个 Unicode 码点且不得含 C0/C1 控制字符。旧文档不迁移。

3. **宿主目录是严格、安全的作者投影。** `ScreenHostVariableCatalogPort` 只返回名称、描述、
   `variableId` 与 `previewable`，分页最多 50 项；响应拒绝未知字段、非法名称/游标、重复 ID 和
   超限内容。启用 `variableCatalog` capability 必须同时启用并提供 `variables` 解析端口。

4. **运行解析与作者预览分权。** `ScreenHostVariableRequest` 必须携带 `purpose`：运行期使用
   `runtime`，作者预览使用 `authoring-preview`。宿主可按变量、租户和权限拒绝预览。预览值先过
   1 MiB JSON budget，只在会话内显示最多 8 KiB 的格式化摘要，不进入文档或历史；失败、超时、
   取消和迟到响应不得暴露值。

5. **变量刷新是显式宿主触发。** Viewer 与 Designer 暴露
   `refreshVariables({ variableIds?, traceId? })`。省略 ID 刷新当前文档全部 host 变量；同一
   `variableId` 的多个别名只解析一次并同步提交。多目标刷新原子成功或保留最后成功快照，只有值
   发生语义变化时才以 `variable` trigger 重渲染依赖组件。并发调用合并目标，全量请求优先，取消
   与 generation guard 拒绝迟到结果。自动更新由宿主调度调用，不进入 Engine。

6. **重命名由 Core 原子完成。** 新增 `rename-variable` 命令，同时更新变量名、组件数据源参数、
   Blueprint `set-variable` 目标以及条件/动作中的递归变量表达式。非法名、重名和目标缺失失败关闭
   且零部分修改；no-op 返回原文档且不产生历史。无论引用数量多少只产生一条历史，undo/redo 整体往返。

7. **Designer 提供完整但有界的变量管理。** 面板支持搜索、类型筛选、描述、引用数、复制、删除
   和静态/host 重命名；host `variableId` 始终只读。新建 host 变量必须从可取消、分页、抗迟到的
   目录选择，不提供手填 URL 或 ID。删除被引用变量继续失败关闭；复制只预填新建表单，不复制引用。

8. **Blueprint 只复用现有表达式。** 已连接 `set-variable` 动作可选择 JSON literal、完整触发
   事件、Manifest 声明的事件字段路径或其他变量。`array`/`object` 表达式继续解析和运行，但本批
   不新增其作者控件，也不引入 JavaScript、表达式字符串或新节点语义。

9. **数据源测试遵守相同预览权限。** 测试宿主数据源前，以 `authoring-preview` 解析所需 host
   变量；任一参数解析失败时不发送缺失参数的资源请求。

## 3. 非目标

- 不实现 DataV 的 URL/SQL/API 变量来源、任意 JavaScript 过滤器或 Engine 内轮询/订阅。
- 不在目录或预览响应中暴露凭证、租户对象、请求配置或未经裁剪的业务数据。
- 不新增包、生产依赖、后端、缓存或跨实例共享状态。
- 不改变 Blueprint 节点类型、条件语言或复杂 ECharts/领域配置的宿主归属。

## 4. 兼容性与取代关系

- 旧文档没有 `description` 时保持有效；本批按探索阶段规则原子升级公共宿主接口，不增加版本字段
  或兼容分支。
- 本 ADR 取代 ADR-0054 中“host 变量只读且不可新建/编辑/删除”“被引用变量不可重命名”和
  “公共契约零变化”的结论；ADR-0054 的变量面板入口、静态值编辑、重名保护和引用删除保护继续有效。

## 5. 结果

变量作者体验获得 DataV 中可复用的描述、目录选择、预览、复制和跨组件联动能力，同时动态来源、
权限、查询和调度仍由宿主掌握。canonical 文档保持小而严格，运行刷新和作者预览都有明确目的、容量、
取消与失败关闭边界。

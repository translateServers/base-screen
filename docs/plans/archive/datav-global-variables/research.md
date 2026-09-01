# DataV 全局变量调研记录

> 状态：已完成并归档
> 日期：2026-09-01
> 结论依据：[ADR-0067](../../../decisions/ADR-0067-datav-inspired-global-variables.md)

## 调研范围

本次只研究阿里云 DataV 官方文档中的全局变量作者体验与使用路径：

- [全局变量配置](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/global-variable-configuration)
- [管理全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/manage-global-variables)
- [使用全局变量](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/use-global-variables)
- [全局变量案例](https://help.aliyun.com/zh/datav/datav-7-0/user-guide/example-of-using-global-variables)

调研记录只描述外部产品事实与 Base Screen 的取舍，不复制 DataV 实现、代码或视觉资产。

## DataV 可见能力

1. 变量配置包含名称、描述、来源、初始值、过滤器、响应结果、受控模式和自动更新。
2. 来源覆盖静态值、数据源请求和 URL 查询条件；数据源变量可以引用其他变量，API/SQL 使用变量
   插值，响应结果可手动刷新查看。
3. 变量支持重命名、复制、删除和添加到蓝图；删除前要求先取消引用。
4. 组件交互可把事件参数更新到变量；变量又可进入组件数据接口、蓝图逻辑和过滤器，形成跨组件联动。
5. 自动更新允许配置轮询频次；受控模式开启后初始值不再主导当前值。

## 对 Base Screen 的映射

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

## 安全与产品结论

- 目录只暴露安全摘要；`variableId` 是稳定 opaque 标识，不是 URL 或查询文本。
- `previewable` 只表示宿主允许发起预览，最终授权仍由 `purpose: 'authoring-preview'` 的解析结果决定。
- 预览失败不显示宿主错误正文或旧值；数据源测试参数不完整时不发资源请求。
- 动态更新不在 Engine 建立计时器、后台任务或缓存；宿主可按自己的路由、权限和生命周期调度刷新。
- DataV 的任意过滤器、SQL/API 编辑器和 URL 注入不进入 Base Screen；复杂编辑器继续由宿主拥有。

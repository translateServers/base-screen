# ADR-0018：宿主意图、资产与图形 Blueprint

> 状态：已接受
> 日期：2026-08-05
> 扩展：[ADR-0010](./ADR-0010-host-resource-deadline-and-blueprint-runtime.md)、[ADR-0013](./ADR-0013-core-canonical-blueprint-mutation.md)、[ADR-0084](./ADR-0084-plugin-contribution-vocabulary-and-trust.md)
> 历史适用：[已归档 Designer Full Product](../specs/archive/designer-full-product/spec.md)
> 后续边界：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)

## 决策

Canonical document 只保存 strict、JSON-safe 的宿主资源和授权动作 intent。资源目录由宿主授权和解析；资产只保存
宿主 asset identity 与允许的展示元数据。document 不保存 URL、header、token、cookie、SQL、脚本、请求 body 或
任意网络执行配置。

变量包括 static value 与宿主解析 value；计算只允许受限结构化表达式，不使用 `eval`、函数或脚本。Material action
必须由 Manifest 声明且由 runtime contribution authority 授权。

Blueprint 的 canonical 语义包括受支持 trigger、condition、delay/comment 投影、有序 action 与诊断。数据集、API、
导航和请求类 UI 都选择宿主目录的资源或 action intent；宿主在执行前重新验证项目、租户、权限和发布状态。

图形 Blueprint 的节点位置、边路由、视口、选区、MiniMap 和搜索状态属于 Engine session，不进入 document、history、
export 或 host payload。Contracts 拥有 shape/parser；Core 拥有 mutation/compile/runtime；Plugin Core 拥有 Material
声明；Renderer 只消费已解析状态；Engine 只编排 UI。

## 后果

- 完整数据与交互工作流不泄露网络或业务配置。
- 资产替换、删除保护、资源预览、超时、取消和 late-result guard 可由宿主实现并通过固定 ports 验证。
- 旧的单一当前 document shape 仍 fail closed；不增加兼容字段或平行 document 形态。

## 排除方案

- 直接将 API/dataset/request 配置持久化到 document：拒绝，扩大攻击面且绑定宿主。
- 将图形节点和边形状作为执行真相：拒绝，锁定编辑器实现并破坏键盘等价路径。
- 允许 executable expression 或 Material 私有 action：拒绝，违反安全和 capability 边界。

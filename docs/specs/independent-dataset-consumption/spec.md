# 独立数据集消费

> 状态：生效中
> 依据：[ADR-0069](../../decisions/ADR-0069-independent-dataset-consumption.md)

## Requirements

实现统一数据集 groups/list/describe/query 端口，以及只持有发布标识、参数和绑定的 dataset 数据源。参数支持标量类型、必填、默认值及有限约束，严格失败关闭。

宿主维护分类与查询；基座不包含 xjdatahub 的来源枚举、连接、SQL、凭据、业务权限或调度。Designer、Viewer、物料与 SDK 使用同一契约，元数据及查询共用执行预算和取消。资源共享复用实例内协调，不新增完成结果缓存。

## Tasks

- [ ] Contracts 类型、解析、Schema、参数校验和测试。
- [ ] Core 参数依赖与绑定。
- [ ] Renderer/Viewer 端口、描述、查询和取消共享。
- [ ] Engine 目录分组、参数编辑、绑定及预览。
- [ ] Plugin/Material/SDK 和示例切换。
- [ ] 删除旧数据集消费路径、更新公共报告、文档与 changeset。
- [ ] 宿主同步、端到端和 verify:m0。

## 验收

不同数据集参数独立；非法元数据/变量/参数不查询；描述与查询合计受限；共享请求的独立取消正确；旧响应不覆盖新状态；绑定变化不重复取数。宿主分组透传且切组重置游标。包导入与十二包边界不变。

宿主业务主规格在 xjdatahub 的 data-system-refactor，任务编号 data-system-refactor。上游实现与宿主实际消费分别登记，全部检查通过前不声明已接入。

## 本地示例恢复记录（2026-09-05）

Browser Harness 和 Playground 曾向只读的 `BaseScreenViewerElement.datasetPort` 赋值，
导致模块初始化抛出 TypeError，设计器和 Viewer 未完成加载。示例现通过 `configure()` 注入数据集端口，
Playground 直接使用公开元素类型，不再手写一个错误地声明可写属性的接口。

条件样式示例改用保留数值类型的变量，避免文本物料对数据集的字符串投影影响数值阈值测试；
数据集变量引用检查同步使用当前 `dataset` 形态。

本地已验证画布加载、物料添加、撤销和数据渲染；Playground 浏览器回归及两个示例的 Vite 构建通过。
同时补齐宿主组件文本编辑、声明式字段选择器对 `dataset` 参数与绑定的读写；字段事务专项 12 项通过。
最终 `verify:browser`、`verify:m0` 均通过，修复包已通过跨仓工作流同步到 xjdatahub。（Playground 示例此后已从仓库移除，相关回归现由 `examples/browser-harness` 的 `?designer&case=dataset` 场景与 `verify:browser` 覆盖。）
本记录不代表宿主业务数据切换或上述完整交付任务已完成。

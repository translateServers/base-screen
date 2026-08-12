# Tasks

- [x] 记录官方图表/表格契约的 ADR 与职责边界。
- [x] 实现表格列、行和图表 series/point 的公共类型。
- [x] 实现严格 JSON 解析和 detached 输出。
- [x] 导出公共类型与解析器。
- [x] 添加契约负向和正向测试。
- [x] 实现官方 `base.chart` 物料及自动注册。
- [x] 实现官方 `base.table` 物料及自动注册。
- [x] 覆盖官方物料 Manifest、事件 allowlist 和注册标签测试。
- [x] Manifest 新增可选 `defaultData` 字段并校验 detached。
- [x] 无 dataSource 时 Renderer 以 `ready` 呈现 `defaultData`，未声明保持 `idle`。
- [x] 官方表格/图表物料声明满足数据契约的 `defaultData` 示例。
- [x] 官方物料移除 `propertyPanel`/`propsSchema` 内容字段，内容改由数据驱动。
- [x] 创建组件时用 `defaultData` 初始化静态 `dataSource`。

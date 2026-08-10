# Checklist

- [x] 表格列 id 唯一且列能力字段类型受校验。
- [x] 表格行支持动态 JSON 字段，不被 props object schema 限制。
- [x] 图表 series id 唯一，point 的 y 必须为有限数字。
- [x] 未知字段、重复 id 和非法 JSON 输入 fail closed。
- [x] 契约不引入渲染库、DOM、网络或可执行回调。
- [x] 测试矩阵已覆盖当前实现。
- [x] 官方图表物料使用 SVG 展示且不引入图表库依赖。
- [x] 官方表格物料使用语义化 `table`、`thead`、`tbody`、`th` 和 `td`。
- [x] 官方图表和表格物料均通过统一 Material Manifest 校验。
- [x] `defaultData` 为可选字段且随 manifest 一起 detached。
- [x] 无 `dataSource` 时 Renderer 用 `defaultData` 呈现 `ready`，未声明时保持 `idle`。
- [x] 官方表格/图表 `defaultData` 满足各自数据契约。
- [x] 官方物料无 `propertyPanel` 内容表单，内容由静态数据/host-resource 驱动。
- [x] Designer 创建组件时 `defaultData` 初始化为静态数据源。

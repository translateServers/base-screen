---
'base-screen': minor
'@base-screen/plugin-core': minor
'@base-screen/plugin-manager': minor
'@base-screen/plugin-sdk': minor
'@base-screen/engine': patch
---

组合分片正式化第一阶段（ADR-0100）：

- `plugin-core` 成为分片形状契约的唯一所有者：新增 `BaseScreenFragmentDefinition`（物料库展示信息 + 外壳 / 节点组合）、
  `parseBaseScreenFragmentDefinition` 与 `isBaseScreenBoundedName`；`parseBaseScreenComponentFragmentInsertionIntent`
  及 `BaseScreenComponentFragmentInsertionIntent` / `BaseScreenFragmentNode` / `BaseScreenFragmentShell` / `BaseScreenFragmentEntry`
  从 engine 迁入。engine 公共面继续转发这些名称，宿主的导入路径与插入行为不变；节点 `size` 无效时的诊断路径修正为
  `['nodes', <index>, 'size']`。
- 新增插件贡献类型 `fragment`（`BaseScreenPluginFragmentContribution`，身份串 `fragment:<id>`）：分片定义直接写进插件清单，
  不需要能力授权。`plugin-manager` 把它投影进运行时贡献索引，新增可选的 `getFragment` / `listFragments`（按插件声明顺序）。
- `plugin-sdk` 新增 `defineBaseScreenFragment()`，失败关闭地校验并返回冻结的 `fragment` 贡献。

物料库展示、catalog 一致性试运行与示例分片属于第一阶段后半段，尚未包含在本次变更中。

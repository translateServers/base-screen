---
'base-screen': minor
'@base-screen/engine': minor
---

组合分片正式化第一阶段 1b（ADR-0100）：物料库展示组合分片。

- 设计器新增 `materialLibraryFragments`（`configure` 选项与元素属性）：宿主声明的 `BaseScreenFragmentDefinition[]`，
  形状错误失败关闭。它与 `materialLibraryItems` 相互独立——后者须覆盖全部可见物料，分片不受这条约束。
  新增公共解析器 `parseBaseScreenMaterialLibraryFragments`，engine 公共面转发 `BaseScreenFragmentDefinition`。
- 宿主分片与插件 `fragment` 贡献（经 `runtimeContributions.listFragments`）一起出现在物料库：
  每份分片先在空文档上按当前 catalog 试运行一次（与插入同一个事务构建器），失败的分片被隐藏并上报 `warning` 诊断，
  其余物料库不受影响；同 id 时宿主优先。
- 分片卡片与物料按 category 混排，带「组合」角标；未给 `cover` 时按试运行几何绘制示意线框。点击、回车或拖入画布即按
  `insertComponentFragment` 的语义整片插入（可撤销，成功后整片选中）；任一组成物料不可用时卡片禁用。
- 宿主分组新增 `fragmentIds`：分组内排在本组物料之后；未被任何分组引用的分片在「全部」视图末尾出现。
  分组导航计数同时计入物料与分片。

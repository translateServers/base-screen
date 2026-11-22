---
'base-screen': minor
'@base-screen/contracts': minor
'@base-screen/plugin-core': minor
'@base-screen/engine': minor
---

组合分片第二阶段（ADR-0100）：共享数据、分片内联动与「存为组合」。

- `contracts` 新增文档片段的独立解析入口：`parseScreenValueRef`、`parseScreenDataBinding`、
  `parseScreenDataSourceInstance`（文档级数据源实例）、`parseScreenBlueprintRelation`。复用文档校验里对应位置的
  校验函数，只判定形状；引用存在性与环判定仍属 `parseScreenDocument`。
- 分片组合（插入意图与分片定义共用）新增：
  - `dataSources`：分片自带的文档级数据源（`key` 代替 `id`，至多 16 个）；参数里的 `data-source-field` 只能引用更早声明的分片数据源；
  - 节点 `dataValue` / `dataBinding`：读取分片数据源（与 legacy `dataSource` 互斥，`dataBinding` 需配 `data-source-field`）；
  - `relations`：端点为外壳 / 节点 `key` 的蓝图关系（至多 32 条）；
  - 外壳与节点 `rotation`（[-180, 180)）。
  分片不携带变量：任何变量引用都被拒绝。插入时数据源与关系的 key 重映射为文档内唯一 id，
  事务顺序为「数据源 → 组件 → 蓝图关系」，仍是一次可撤销提交。新增导出类型 `BaseScreenFragmentBody`、
  `BaseScreenFragmentDataSource`、`BaseScreenFragmentRelation`。
- 物料库试运行在事务构建之后再按整份文档校验一次展开结果，与真正插入时的判定同一口径。
- 设计器新增 `createComponentFragment(componentIds?)`：把选区（连同后代）提取为分片组合，只读；单个可容纳子节点的根成为外壳，
  选区读取的数据源（含传递依赖）与端点全在选区内的关系一起带走。选区引用变量时失败关闭；条件样式、锁定 / 隐藏状态与跨出选区的
  关系以 warning 诊断告知被舍弃。
- `configure({ fragmentSaveAction: true })` 开启「存为组合」操作（右键菜单与命令面板）：提取成功后派发
  `BASE_SCREEN_FRAGMENT_SAVE_REQUEST_EVENT`（`base-screen-fragment-save-request`，detail 为
  `BaseScreenFragmentSaveRequestEventDetail`），命名、归类与存储归宿主。`base-screen/designer` 同步转发该事件、
  详情类型与 1b 遗漏的 `parseBaseScreenMaterialLibraryFragments`。

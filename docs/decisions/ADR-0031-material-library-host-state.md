# ADR-0031：左侧物料库宿主状态投影

> 状态：已接受
> 日期：2026-08-12
> 关联：[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0029](./ADR-0029-host-managed-material-package-distribution.md)

## 1. 背景

Base Screen 的左侧物料库当前只消费初始化时已经构造完成的不可变 catalog。宿主从线上加载可信物料包后，
物料可以正常进入该列表，但设计者无法在面板内判断目录是否正在加载、是否使用离线结果、是否部分失败或是否有
更新，也无法区分草稿与不可用物料。

这些状态不能通过宿主访问 Designer Shadow DOM 注入，也不应写入 Material Manifest 或 ScreenDocument。

## 2. 决策

1. Engine 增加可选、JSON-safe、只读的 `BaseScreenMaterialLibraryState` 展示投影。状态仅描述当前 Designer
   实例看到的目录，不加载物料、不改变 catalog，也不进入文档、历史或导出物。
2. 状态固定为 `loading | ready | offline | partial | error | update-available`，并可声明草稿 type、不可用 type 与失败数量。
   输入拒绝未知字段、重复 type、越界数量和非法值。
3. 左侧物料库使用 Manifest 现有 `category` 提供分类筛选；草稿与不可用标记只来自宿主状态投影，不扩展
   Manifest。
4. 不可用物料保留在列表中用于解释当前目录状态，但不能点击或拖拽创建。
5. 面板动作只发出 composed Custom Event：`retry`、`reload` 或 `details`。宿主决定鉴权、联网、未保存内容处理、
   unload/reconfigure 和外部问题界面。
6. catalog 继续实例级不可变。宿主加载新集合时必须先 unload，再以新 catalog 重新 configure；状态 setter 只能更新
   展示投影。
7. 未提供状态投影的既有宿主保持原有精简面板，不显示目录状态条。

## 3. 非目标

- Base Screen 不实现物料市场、分页远程目录、下载、鉴权、签名、版本选择、审核或发布。
- 不把 URL、包版本、租户、凭证、摘要或宿主错误对象写入状态投影。
- 不允许宿主访问或修改 Designer 私有 Shadow DOM。

## 4. 结果

- 线上物料的加载、离线兜底、部分失败与更新提示在左侧面板形成用户闭环。
- 运行时物料 ABI、ScreenDocument 和 catalog 不变。
- 新的公共展示类型和事件需由专项 Spec、API 检查、浏览器测试与 tarball 验收保护。

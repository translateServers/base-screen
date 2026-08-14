# Host Material Library Grouping Spec

> 状态：生效中
> 日期：2026-08-13
> 依据：[ADR-0033](../../decisions/ADR-0033-host-controlled-material-library-grouping.md)

## 1. 目标

让宿主以 JSON-safe、有界、可热更新的树形投影控制 Designer 左侧物料库的多级分组与展示顺序。Designer
提供参考 Light Chaser 的逐级导航和缩略图网格，保持 catalog、Manifest、ScreenDocument 与宿主边界不变。

## 2. Requirements

### R1：严格的宿主分组契约

Engine SHALL 导出 `BaseScreenMaterialLibraryGrouping` 与递归 `BaseScreenMaterialLibraryGroup`，节点只允许
`id`、`label`、`materialTypes` 和 `children`。解析 SHALL 仅接受 JSON-safe 输入，并拒绝未知字段、非法/重复组 id、
空标签、非法/重复物料 type、空节点、越界的节点数、物料数和嵌套深度。解析成功的对象与数组 SHALL 深度冻结。

### R2：catalog 一致性与原子更新

`BaseScreenDesignerConfiguration` SHALL 接受可选 `materialLibraryGrouping`，`BaseScreenDesignerElement` SHALL
公开同名 getter/setter 和 parse API。`configure()` SHALL 在提交任一运行时字段前完成结构与 catalog 一致性校验：
所有 `libraryVisible !== false` 的 catalog 条目必须在树中恰好一次，隐藏或不存在的 type SHALL 导致配置失败且
不改变现有状态。运行时 setter 的无效输入 SHALL 发出诊断并保持旧投影；有效更新 SHALL 只重绘物料库，不重建
Renderer 或替换 catalog。

### R3：多级物料库导航

配置分组时，物料 Tab SHALL 显示「全部」入口、可点击的当前路径面包屑和当前层级的有序子组控件。选择组 SHALL
将网格范围限定为该组与后代的 `materialTypes`，并允许通过面包屑返回上级；任意合法深度的树 SHALL 可浏览。
卡片顺序 SHALL 遵循宿主的组顺序和每组的 `materialTypes` 顺序。所有新增交互 SHALL 有可访问名称、明确
`aria-pressed` 状态和稳定的 `data-material-group` / `data-material-group-breadcrumb` 契约。

### R4：既有筛选、状态与兼容性

搜索、收藏与最近使用 SHALL 与当前选中组取交集；不可用、草稿和宿主状态投影 SHALL 继续作用于分组后的卡片。
未提供 `materialLibraryGrouping` 时，既有 Manifest `category` chips、搜索、卡片排序和 data-* 语义 SHALL 保持。
分组信息不得写入 Manifest、catalog、ScreenDocument、历史或导出物，也不得触发联网、存储、物料注册或宿主
Shadow DOM 访问。

### R5：质量与集成

新增用户可见文案 SHALL 集中于 `designer-ui-text.ts`；browser 树不得内联 CJK 字面量。分组导航、更新、筛选和
卡片顺序 SHALL 不引入尺寸抖动或重建 Renderer。解析/一致性、DOM、控制器、Element、SDK 公共导出、使用文档和
真实 browser harness SHALL 覆盖该能力；`pnpm verify:m0` SHALL 通过。

## 3. 非目标

- Engine 内建物料分组的 CRUD、拖拽整理、权限、存储、网络或目录服务。
- 改动 Material Manifest、catalog ABI、ScreenDocument、Renderer 或 Viewer。
- 支持任意图标、HTML、SVG、函数或宿主对象作为组元数据。
- 取代未配置投影时的 Manifest `category` 兼容模式。

## 4. 完成定义

- `tasks.md` 和 `checklist.md` 的所有适用项完成，测试矩阵与实现一致。
- 聚焦测试、真实 browser harness 与 `pnpm verify:m0` 通过。
- ADR、Spec 索引、能力基线与使用文档反映当前公共边界。

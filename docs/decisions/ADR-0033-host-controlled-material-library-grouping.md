# ADR-0033：宿主控制的多级物料库分组

> 状态：已接受
> 日期：2026-08-13
> 关联：[ADR-0021](./ADR-0021-material-library-visibility.md)、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)、[ADR-0031](./ADR-0031-material-library-host-state.md)、[ADR-0032](./ADR-0032-designer-left-panel-refactor.md)
> 参考：[Light Chaser](https://github.com/xiaopujun/light-chaser) 的主类目、子类目、搜索与物料网格交互范式

## 1. 背景

当前 Designer 左侧物料库仅使用 Material Manifest 的单个 `category` 生成扁平分类 chips。`category` 是物料作者
声明的一部分，不能表达同一套物料在不同宿主、租户、权限范围或业务场景下的层级目录、顺序和归属。

Light Chaser 通过主类目、子类目、搜索与拖拽物料网格提高了大屏设计器的扫描效率，但其类目注册与物料声明都由
应用自身拥有。Base Screen 必须保留轻量基座边界：宿主负责业务分组和持久化，Engine 只提供受限的展示与交互
能力，不能借由 Designer Shadow DOM 或 Manifest 私有字段逃逸。

## 2. 决策

1. Engine 增加可选、JSON-safe、只读的 `BaseScreenMaterialLibraryGrouping` 展示投影。它通过 Designer
   `configure()` 与同名 property 提供，和 `BaseScreenMaterialLibraryState` 分离；前者描述目录树，后者描述
   加载、草稿和不可用状态。
2. 分组投影由宿主提供有序树。每个节点只包含稳定 `id`、显示 `label`、可选的 `materialTypes` 与可选的
   `children`。数组顺序就是宿主指定的组和物料顺序；组可嵌套到有界深度，物料 type 在整棵树中只能出现一次。
3. 输入严格失败关闭：拒绝未知字段、非 JSON-safe 值、非法或重复组 id、空标签、非法或重复 type、空节点和
   超过组数、物料数或深度上限的树。配置和 property 更新还必须针对当前不可变 catalog 校验：每个
   `libraryVisible !== false` 的物料恰好被引用一次，隐藏物料或 catalog 中不存在的 type 不能进入分组树。
4. 配置分组时，左侧物料库提供「全部」入口、当前路径面包屑和当前层级子组按钮；选择任意组时，卡片网格显示
   该节点及其全部后代的物料。该模式保留 Light Chaser 的逐级收窄与网格扫描优势，并支持超过两级的目录。
   搜索、收藏和最近使用继续与当前组范围取交集。
5. 未配置分组投影时，现有基于 Manifest `category` 的 chips、搜索与排序语义保持不变，确保既有宿主无需改造。
6. 分组只影响当前实例的物料库 DOM，不进入 Material Manifest、catalog、ScreenDocument、历史、导出物、Renderer
   或 Viewer。分组更新不会重建 Renderer；真实 catalog 更换仍由宿主先 `unload()` 再重新配置。
7. 分组树定义、权限过滤、物料可见性策略、用户级目录状态与持久化均归宿主。Base Screen 不提供组的增删改、
   拖拽整理、网络请求、存储、通用图标注入或宿主 Shadow DOM 访问入口；当前选中路径仅是实例内瞬态 UI 状态。

## 3. 非目标

- 将分组字段加入 Material Manifest、插件包或 ScreenDocument。
- 在 Engine 中实现租户、权限、目录数据库、收藏/最近使用持久化或物料市场。
- 允许任意 HTML、SVG、组件、函数、Promise、URL 或宿主服务对象作为分组元数据。
- 用分组投影绕过 `libraryVisible` 或替换 catalog 的不可变性。

## 4. 结果

- 同一份可信物料 catalog 能由不同宿主注入不同的多级目录，而物料 ABI 与 canonical 文档保持稳定。
- Designer 获得与 Light Chaser 同类的逐级物料导航和网格发现体验，同时不会把业务目录职责引入 Engine。
- 新公共投影、配置原子性、DOM 交互、真实浏览器验证与 tarball/API 门禁由专项 Spec 保护。

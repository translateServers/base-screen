# @base-screen/material

## 0.1.0

### Minor Changes

- 14fc8cd: Consolidated record of three changes to the host data boundary: the dataset port and parameter authority, global variable authoring, and host resource authoring intents.

  ### independent-dataset-consumption

  Separate tabular datasets from generic host resources. Add `ScreenHostDatasetPort`, opaque dataset
  publication identities, dataset-owned parameter constraints, host-defined catalog groups, and a
  dedicated `dataset` document source. Designer and Viewer now share the same bounded metadata and query
  lifecycle. Host resource types remain available for non-tabular resources.

  ### stable-global-variables

  Expand global variable authoring with strict host catalogs, authoring previews, atomic renames,
  explicit runtime refresh, and structured Blueprint value sources while keeping dynamic data
  ownership with the host.

  ### host-resource-authoring-intents

  Replace the legacy asset catalog adapter with strict host resource authoring intents,
  viewport-centered insertion, validated native drag/drop, and dataSource-only replacement.
  Resource discovery, permissions, previews, signing, and lifecycle remain host-owned.

- 14fc8cd: Consolidated record of seven changes to material rendering, typography and the loading surface.

  ### material-loading-container

  Provide an opt-in loading container driven by the public material presentation status. Preserve
  content nodes while loading, manage accessibility and cleanup, and expose CSS variables and parts
  for host styling without new document fields, requests, registration, or framework dependencies.
  Allow status updates to override the plain-text loading label without replacing content nodes.

  ### shared-material-loading

  Expose a framework-independent loading element factory for host-authored materials. The opt-in view inherits typography and color, isolates its styles, supports reduced motion and accessible status text, and leaves data state and lifecycle ownership with the material.

  ### text-auto-width

  Add opt-in automatic width for official text, preserving explicit lines and spaces across Designer,
  preview, and Viewer. Keep measured widths in runtime geometry without changing saved fallback sizes,
  dirty state, or history. Explicit width edits and disabling the option commit fixed widths atomically;
  height edits, movement, rotation, cancellation, copying, and inline text editing retain their intended
  document and history semantics.

  ### image-density-size

  Add one-time 1x through 4x natural-image sizing for a singly selected official image while keeping
  the resulting component size fixed and the public material and document contracts unchanged.

  ### rectangle-gradient-border

  Allow rectangle border colors to use linear or radial gradients while preserving rounded corners,
  transparent or gradient fills, shadows, and canonical component bounds.

  ### show-shape-border-color

  Enable a zero-width border when its color is changed in the Designer, including batch edits, and
  keep rendered shape borders inside the canonical component bounds to avoid geometry shifts.

  ### fix-material-render-box-size

  Fix material rendering boxes that did not match their canonical size.

  `plugin-echarts` set `width/height: 100%` on its host element in
  `renderMaterial()`, overwriting the pixel size the renderer had just written from
  `component.size` — a widget declared 480x280 rendered at 960x540, filling the whole
  canvas. It now leaves the host box alone, like the official materials.

  `base.container` drew its border without `box-sizing: border-box`, so `borderWidth`
  added to the declared size (a 1px border made the box 2px larger). It now matches what
  the shape materials already do.

  Both are covered by a new catalog-wide browser assertion
  (`BROWSER_HARNESS_MATERIAL_GEOMETRY_FAILED`) that instantiates every material in the
  catalog — including `libraryVisible: false` ones — and requires each render box to
  equal its declared size. This replaces per-material assertions, which is why the same
  bug was able to reappear in several packages unnoticed.

- bcc37a0: 官方物料集新增分割线 `base.rule`（`base-screen-rule`，另开 `./rule` 子路径）：一条线是这个物料
  的全部职责——不填充、不带标题、不描边框，因此与 `base.rectangle` 不重叠（矩形负责一块面，本物料
  负责一条线）。方向由 `props.axis`（`horizontal` / `vertical`）决定，线沿盒子一边绘制；`color` /
  `thickness` / `dash` / `opacity` 属样式。此前只能用 1px 矩形假冒分割线，而矩形的填充与圆角无法关闭。
  渲染仍遵守渲染盒不变式：物料只写自身内部样式，宽高由渲染器按 canonical `component.size` 写入。
  `@base-screen/sdk` 的自动注册随其生效。不改变 canonical 文档契约与物料 ABI。

### Patch Changes

- e468741: Require an explicit material manifest opt-in (`hostResourceSelection`) before exposing the host
  asset selection bridge; only `base.image` opts in, so host-resource materials such as metrics and
  charts no longer show the "选择素材" button.
- bcc37a0: 把物料非 ready 态的呈现收敛到一处：`@base-screen/plugin-sdk` 新增状态视图
  （`createBaseScreenMaterialStateView` / `createBaseScreenMaterialErrorView` /
  `createBaseScreenMaterialEmptyView`），loading 视图与公共加载容器从 `@base-screen/material`
  迁到 plugin-sdk，`@base-screen/material` 与 `@base-screen/sdk/material` 继续按原名 re-export。
  官方物料与大屏组件插件不再各写一份占位文案：`idle` 占位但不给文案（此前被当成「暂无数据」），
  `error` 直接呈现 contracts 侧已脱敏的 `message` 并把 `code` 落到 `data-*` 属性。
  官方物料基类另收一个受保护的盒面方法，形状与容器共用同一套填充/边框/渐变叠加/圆角/阴影实现。
  不改变 canonical 文档、Manifest 字段或物料 ABI。
- Updated dependencies [253e4c3]
- Updated dependencies [b9d0b80]
- Updated dependencies [8537e4b]
- Updated dependencies [af22711]
- Updated dependencies [f06fc5c]
- Updated dependencies [df083f5]
- Updated dependencies [13a9c3d]
- Updated dependencies [14fc8cd]
- Updated dependencies [e12e6cb]
- Updated dependencies [e468741]
- Updated dependencies [bcc37a0]
- Updated dependencies [14fc8cd]
- Updated dependencies [14fc8cd]
- Updated dependencies [81fa908]
- Updated dependencies [afc60b0]
- Updated dependencies [2dc2b3e]
- Updated dependencies [14fc8cd]
- Updated dependencies [81c3cea]
  - @base-screen/contracts@0.1.0
  - @base-screen/plugin-core@0.1.0
  - @base-screen/plugin-sdk@0.1.0

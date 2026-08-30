# Designer Left Panel Checklist

> 状态：已完成（2026-08-25）

## 信息架构（R1）

- [x] 面板头 + sticky 分段 Tab（物料/图层）结构落地，物料工具栏不出现在图层 Tab。
- [x] Tab 切换前后：左轨宽度、画布区域、右面板矩形不变（浏览器几何断言）。
- [x] 左轨滚动条轨道稳定（scrollbar-gutter: stable），内容切换无水平跳动。

## 组件卡片网格（R2）

- [x] 2 列等宽网格；卡片含缩略图、名称、type 与悬浮收藏星标。
- [x] 分类图标与色相由分类名确定性派生，深/浅主题下可读（图标色随主题 Token 混合）。
- [x] hover 仅 box-shadow/border-color/transform，几何（width/height/position）不变。
- [x] 搜索匹配名称/type/分类；无结果空态可见、有结果时空态隐藏。

## 筛选与键盘可达性（R3）

- [x] 全部/收藏/最近分段与分类 chips 契约不变，aria-pressed 同步。
- [x] 搜索清除按钮可见性随内容切换；Escape 清空搜索并保持焦点。
- [x] 方向键在可见卡片间移动焦点，Home/End 到首/尾；Enter 控件级添加组件（不触发「进入组内」），Space 保持抓手语义。
- [x] 收藏切换 aria-pressed 与星标文案同步。

## 折叠图标轨（R4）

- [x] 折叠态显示垂直图标 Tab（tooltip + aria-label），点击展开并切换 Tab。
- [x] 展开/折叠仅原子切换 `--left-panel-width`；画布、右面板无几何跳动。
- [x] `data-panel-collapse="left"` 与 Tab ARIA（role/aria-selected）保持。

## 图层树（R5）

- [x] 缩进引导线由 `--layer-depth` 驱动，深层级对齐正确。
- [x] 隐藏/锁定/上移/下移为图标按钮；hover/focus-within/选中时显示，无几何变化。
- [x] 含子节点行显示子项计数。
- [x] 图层搜索、展开收起、树键盘导航、拖拽重排/重父级全部保持。
- [x] 图层列表遵循 DataV 的前层在上语义；六项排列/编组工具栏根据单选、多选与边界状态启停。
- [x] 行内定位可将组件中心移至视口并聚焦画布；名称点击、隐藏/锁定与排序命中区域互不覆盖。
- [x] 操作簇从定位入口向左展开且行高不变；隐藏的图层 Tab 不渲染、不截获物料面板点击。
- [x] 选中底色覆盖范围与整行点击范围一致；折叠/定位/隐藏/锁定/排序等独立控件不穿透为选择，
      锁定图层仍可从图层树选中并解锁。
- [x] 图层行保持 36px 紧凑高度且按钮命中不小于 24px；键盘焦点环投影到整行，hover/选中不改变几何。
- [x] 未选中图层第一次点击导致行节点重绘后，第二次真实指针点击仍可进入重命名；输入框获得焦点且
      Enter 写回名称，修饰键/键盘或程序化 click 不误触重命名。

## 契约与边界（R6）

- [x] 既有全部 data-* 契约语义不变；verify-browser-harness 原断言通过。
- [x] ScreenDocument/Manifest/catalog/SDK 公共 API 零变更；无新增依赖与 package。（修订注：2026-08-16
      起 Manifest 允许可选 `cover` 字段，仅物料库封面展示，见 [Material Cover Thumbnail](../material-cover-thumbnail/spec.md)）
- [x] 新增文案全部集中 designer-ui-text.ts；check-designer-ui.mjs 通过。

## 质量与无抖动（R7）

- [x] 单元测试：workspace、material-library、layers-dom、panel-controller、workbench-controller 覆盖新行为。
- [x] 原封版 `pnpm verify:browser` 通过（含图层前后顺序、工具栏事务、定位、命中区域与无抖动断言）。
- [x] 图层整行点击与选中绘制专项在 1024、1366、1440 三种桌面宽度下通过真实 Chromium 断言与截图。
- [x] 图层跨重绘双击重命名在三种桌面宽度下通过真实 Chromium 输入聚焦与 Enter 提交断言。
- [x] engine lint/typecheck/test 通过；`pnpm verify:m0` 全量通过。
- [x] 基线 README 与路线图文档已登记本增量。

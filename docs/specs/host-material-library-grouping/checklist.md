# Host Material Library Grouping Checklist

> 状态：已完成（2026-08-13，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿）

## 契约与配置（R1、R2）

- [x] JSON-safe 分组树严格拒绝未知字段、非法 id/label/type、重复 id/type、空节点和超出容量/深度的输入。
- [x] 解析结果的根、节点和数组均不可变。
- [x] `configure()` 在提交前校验可见 catalog 条目一一覆盖，隐藏/缺失引用失败且旧配置不变。
- [x] getter/setter 与 SDK 导出可用；有效分组更新不重建 Renderer 或更换 catalog。

## 物料库体验（R3、R4）

- [x] 分组模式有全部入口、路径面包屑、当前层级有序子组与可访问选择状态。
- [x] 任意合法深度可进入和返回；选中组显示其后代物料，卡片顺序服从宿主树。
- [x] 搜索、收藏、最近、草稿和不可用状态与当前组正确组合；不可用物料仍不能创建或拖拽。
- [x] 未配置分组时，既有 category chips、搜索、卡片排序与 data-* 契约保持。

## 质量与交付（R5）

- [x] 文案集中、browser CJK 门禁通过；导航和更新不造成布局抖动或 Renderer 重建。
- [x] 单元、DOM、Element、public API、SDK、使用文档和真实 browser harness 覆盖核心场景。
- [x] 格式化、聚焦检查、`pnpm verify:browser` 与 `pnpm verify:m0` 通过，能力基线已同步。

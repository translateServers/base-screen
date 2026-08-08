# ADR-0024：Designer 宿主可配置主题 Token

> 状态：已接受
> 日期：2026-08-07
> 扩展：[ADR-0017](./ADR-0017-designer-product-host-boundaries.md)
> 适用：[Designer Theme Tokens](../specs/designer-theme-tokens/spec.md)
> 计划：[Designer 外部样式 Token 实施计划](../plans/designer-theme-tokens/implementation-plan.md)

## 决策

`<base-screen-designer>` SHALL 以文档化的 `--base-screen-designer-*` CSS Custom Properties 提供宿主
可配置的 Designer chrome 主题。公共变量是宿主输入；Engine 内部组件继续只消费 `--designer-*` 私有变量，
并在 Tokens 层通过 `var(--base-screen-designer-<name>, <theme-default>)` 建立映射。

首个交付只提供 CSS 契约：宿主通过外部 stylesheet 或元素的 `style.setProperty()` 设置已文档化的名称。
不增加公共 JavaScript setter、theme object、公共 CSS class、`::part`、外部 stylesheet、CSS-in-JS runtime 或
新 package。

缺失 `theme` 或未知值保持 dark；`theme="light"` 选择 light 内建 fallback。宿主明确设置的公共变量优先于
内建 fallback。内建 dark/light 主题必须满足既有可访问性和固定几何要求。

## 所有权和边界

- 宿主拥有 Designer 元素的外部尺寸、位置和页面布局，也拥有文档化公共 Token 的值。
- Engine 拥有 Shadow DOM 内部 DOM、私有 selector、布局 track、breakpoint、z-index、图标几何、交互语义和
  私有 `--designer-*` 名称。
- 公共 Token 只作用于 Engine Designer chrome，不作用于 `body`、宿主控件、兄弟 Designer、Viewer 或 Material
  的 light/Shadow DOM。
- Material appearance 继续属于 Material contract；document canvas 和 Viewer appearance 继续属于 document/
  renderer 所有权。
- Scrollbar Token 仅作用于 Engine 明确拥有的可滚动容器。它们不修改页面、浏览器窗口或 Material 自有滚动条，
  也不公开 scrollbar 厚度。
- Token 值为元素瞬态 CSS 输入，不进入 canonical document、history、project payload、日志、fixture 或 host
  resource intent。

## Token 分级

- 主题级：surface、text、border、focus、semantic state、elevation、motion、scrollbar。每个名称具有 dark/light
  fallback，并允许宿主替换。
- 受限几何级：spacing、control size、radius、typography。Spec 必须在实现前冻结每项的 CSS grammar、允许范围和
  geometry 风险；无法维持固定布局的候选保持私有。
- 私有结构级：panel width、topbar/statusbar height、grid track、breakpoint、z-index、selector、DOM class、
  icon geometry 和 canvas coordinate 永不进入公共 Token 目录。

## 兼容与浏览器策略

- 公共名称一经进入生效中的 Spec 即是宿主 CSS 契约；私有映射和内部默认值可重构，只要公共行为保持。
- 外部未知变量无效果；无效 CSS 值由宿主负责，Engine 不提供自动修复、运行时诊断或 `cssText` 注入入口。
- scrollbar 使用标准 `scrollbar-color` 与 WebKit pseudo-element 增强。不同浏览器仅要求状态语义和可读性等价，
  不要求原生 scrollbar 像素完全相同；forced-colors 下优先保留系统 scrollbar。
- 首次交付不使用 `@property`，因为 font、shadow、transition 等复杂值的跨浏览器注册不应成为宿主主题的前置条件。

## 后果

- 宿主能够实现品牌化 dark/light Designer chrome，并在不访问 Shadow DOM 的情况下覆盖稳定语义角色。
- Engine 保留内部实现、Material 隔离和多实例隔离，不向宿主承诺 DOM 结构或布局实现。
- 受限几何 Token 需要额外 geometry/contrast/browser 证据，实施范围比纯颜色主题更严格。
- API report 和 package export 在 CSS-only 首版不变；发布验证仍须证明消费者不需要额外 CSS import。

## 排除方案

- 公开 `--designer-*`：拒绝，它们是当前 Engine 私有实现名称，公开会阻碍组件与布局重构。
- 宿主注入任意 stylesheet、CSS text 或 Shadow DOM selector：拒绝，破坏隔离、可预测性和 Material 边界。
- 通过 `::part` 或公共 class 暴露所有内部节点：拒绝，形成 DOM 结构兼容承诺，超出主题化范围。
- 首次交付同时增加类型化 JavaScript theme object：拒绝，需先单独确定值校验、清除语义、生命周期和 API 稳定性。
- 公开 panel/grid/z-index 等结构 Token：拒绝，宿主可用外部布局放置 Designer，但不得破坏其内部工作台几何。
- 让 Designer Token 流入 Viewer 或 Material：拒绝，违反 Renderer/Designer 与 Material/Renderer 既有边界。

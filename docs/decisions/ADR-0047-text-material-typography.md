# ADR-0047：文本物料排版能力（水平/垂直对齐分离、字间距、行间距）

> 状态：已接受
> 日期：2026-08-16
> 关联：[ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)（物料 ABI 与 Manifest 契约）、
> [ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)（声明式外观作者契约）

## 1. 背景

官方文本物料（`base.text`）当前的排版能力只有水平对齐 `textAlign`（left/center/right），
缺少垂直对齐、字间距与行间距，无法满足大屏常见标题/数值文本的排版需求（垂直居中、宽字距
标题、多行文本行距）。本 ADR 为该物料补齐三项能力，并明确各项的语义与渲染映射，保证与既有
文档、Manifest 校验与 Designer 属性面板（schema 驱动的通用控件）完全兼容。

## 2. 决策

1. **水平对齐与垂直对齐分离**：
   - `textAlign`（left/center/right）语义收窄为「水平对齐」，标签由「对齐」改为「水平对齐」，
     仍直映射 CSS `text-align`；契约值不变，旧文档零迁移。
   - 新增 `verticalAlign`（enum：`top`/`middle`/`bottom`）「垂直对齐」。渲染映射：
     - 缺失或 `top` → 直接文本节点、`display: block`（与现状完全一致，零回归）；
     - `middle`/`bottom` → 元素保持 `display: block`，文本移入内层 flex wrapper
       （`width/height: 100%`、`align-items: center/flex-end`）实现垂直居中/贴底。
   - **wrapper 机制的必然性**：renderer 按组件可见性契约强制元素 `display: none/block`
     （renderer 测试锁定该行为），物料元素自身的 `display` 不承载布局；垂直对齐只能经
     内层 wrapper 表达，与 renderer 零冲突、对第三方物料零影响。`text-align`、
     `letter-spacing`、`line-height`、`white-space` 均为继承属性，继续设置在元素上，
     经继承作用于 wrapper 内文本；`overflow: hidden` 保持在元素上。进入/退出 wrapper
     路径时清理直接文本节点，避免残留文本把 wrapper 挤到行高之后造成垂直偏移。
2. **字间距**：新增 `letterSpacing`（number，px，0..100，缺省不声明）。渲染映射 CSS
   `letter-spacing: <n>px`；负值不支持（非目标）。新物料默认 `0`。
3. **行间距（增量间距语义）**：新增 `lineSpacing`（number，px，0..512，缺省不声明）。
   语义为「行距增量」：渲染 `line-height = fontSize + lineSpacing`（px），随字号自适应；
   新物料默认 `0`（即行高=字号）。缺省不声明时不设置 `line-height`（浏览器默认，旧文档零回归）。
4. **兼容性**：三个新字段全部为可选（不进 `styleSchema.required`）；`defaultStyle` 同步携带
   `verticalAlign: 'top'`、`letterSpacing: 0`、`lineSpacing: 0`（新拖入文本即带新字段）；
   旧文档（无新字段）渲染与现状逐像素一致；ScreenDocument/contracts/catalog 契约零变化，
   Designer 属性面板经既有 schema 驱动控件（select/number）自动呈现新字段，无需 Engine 改动。
5. **面板布局**：样式区字段顺序为 颜色 → 字号 → 字重 → 水平对齐 → 垂直对齐 → 字间距 → 行间距；
   文案走 Manifest label（物料包内，非 Engine UI 文案），不触碰 `designer-ui-text.ts` 边界。

## 3. 非目标

- 多行溢出策略（截断/省略号/滚动）、自动换行模式扩展。
- 负字间距、行高倍数（如 1.5×）语义、按比例行距、字体族/字重扩展、文本装饰。
- 改变 `textAlign` 既有值语义、ScreenDocument/contracts 契约或其他物料的样式契约。
- 新增依赖、package 或公共 API（Manifest 字段属于物料包内契约，经既有校验通道）。

## 4. 结果

- 文本物料支持水平/垂直独立对齐、字间距与行间距，覆盖大屏标题/数值文本常见排版诉求；
  旧文档与示例工程零迁移、渲染零回归；Manifest 校验（defaultStyle 满足 schema、panel 引用
  schema 键）与 Designer 面板自动生效；由专项 Spec 增量与聚焦测试验收。

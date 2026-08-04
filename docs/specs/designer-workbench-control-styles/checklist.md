# Designer Workbench Control Styles 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)

本清单只按当前代码、自动化输出和当次 screenshot 证据验收。既有 Designer Engine checklist、单个聚焦
测试或主观“看起来更好”均不能替代本清单中的未勾选项。

## 文档与边界

- [x] 本三件套已列入生效中的 Designer 增量规格索引。
- [x] ADR-0001、ADR-0006 和 Designer Engine Spec 是本规格的有效依据。
- [x] 样式仅由 Engine 私有 Shadow DOM chrome 拥有，不成为 SDK、Plugin 或 Material 公共契约。
- [x] TailwindCSS、UI framework、公共 CSS export、host theme API 和新 package 明确为非目标。
- [x] 实施没有改变 canonical Document、Core history、Renderer ABI、Project Adapter 或 SDK stable tag。
- [x] Engine package graph、exports、`sideEffects: false` 和普通 import 契约保持不变。

## 分层源码与构建

- [x] Tokens、Base、Controls、Workbench 使用独立 CSS 源文件并按唯一确定顺序组合。
- [x] `designer-style.ts` 只负责 CSS 文本装配和创建单一 `<style>`。
- [x] 原大型 TypeScript stylesheet 字符串已移除，仓库不存在第二份兼容样式。
- [x] CSS 被打入 Engine JavaScript，dist 不要求消费者加载额外 stylesheet。
- [x] CSS 文本 module 的 TypeScript 声明保持 package 私有，不出现在 public API。
- [x] 构建未新增 Tailwind/PostCSS plugin、Sass/Less、CSS-in-JS runtime 或 UI library。
- [x] Engine import 不写 `document.head`、不创建 `<link>`、不发起样式网络请求。

## Selector 与作用域

- [x] Base/Controls 只命中显式 Engine root、private class 或 private attribute。
- [x] 不存在裸 `button/input/select/textarea/label/svg/*` 工作台 reset。
- [x] 不存在 `.designer *`、`.designer button`、`.properties input` 等偶然容器后代控件规则。
- [x] 不选择 Material tagName 或 `[data-base-screen-component-id]`。
- [x] 动态节点在 DOM helper 创建时取得语义类，不依赖全树扫描或 computed style 决定类型。
- [x] 没有使用 `!important` 修补 specificity；可访问性例外具有对应浏览器证据。
- [x] 私有 class、token、variant 和 CSS 文件没有进入 package export 或公共声明。

## Tokens 与主题

- [x] Surface、text、border、focus、semantic color token 家族完整。
- [x] Spacing、control size、icon、radius、typography、elevation、motion token 家族完整。
- [x] Dark 为默认主题，light 只覆盖 token 值且两主题使用同一组件规则。
- [x] Controls/Workbench 没有可由 token 表达的颜色字面量或重复 theme branch。
- [x] 普通文字 contrast 达到 4.5:1，关键图标、边界和大文字达到 3:1。
- [x] Accent、success、warning、danger 角色清楚，不以单一色相覆盖整个工作台。
- [x] 控件 radius 不超过 6px，真正 dialog/overlay radius 不超过 8px。
- [x] 无装饰 gradient/orb/bokeh；仅保留画布网格等功能性渐变。
- [x] 字号不随 viewport 缩放，letter spacing 为 0，动态数值使用稳定数字宽度。
- [x] `color-scheme`、reduced-motion 和 forced-colors 在 dark/light 下均经过浏览器验证。

## 字段与表单

- [x] 每个字段具有一致的 label/control/description/message 结构和真实关联。
- [x] Text、number、search input 和 select 的同 size 变体高度一致。
- [x] Textarea 共享 input 的边框、padding、focus、invalid 规则并具有稳定最小高度。
- [x] Checkbox 保留 native input、label、keyboard、disabled 和 checked 语义。
- [x] Select 保留 native option、keyboard、focus 和 disabled 行为。
- [x] Engine 自有颜色字段使用 native swatch 与可校验文本值，不猜测 Material string property。
- [x] Readonly 可聚焦复制且与 disabled 明确区分。
- [x] Invalid 同时具有 `aria-invalid`、可见中文反馈和非纯颜色提示。
- [x] Placeholder、description、validation 在 dark/light 中可读且不推动固定布局。
- [x] 长 label、option、technical id 和数值不会覆盖或推出相邻控件。
- [x] 输入法、文本选择、原生 undo、copy/paste 和 editable shortcut 隔离无回归。

## 按钮、Tab 与反馈

- [x] Text/icon button 使用同一基础 primitive 和有限 primary/neutral/ghost/danger variant。
- [x] 熟悉命令使用固定尺寸 icon button，图标以 `currentColor` 跟随状态。
- [x] Toolbar、tool rail、panel、dialog 不再重复按钮基础边框、背景和 focus 规则。
- [x] Tab/segmented control 使用 ARIA selected state，不用 class 保存 selection。
- [x] Status/badge/empty state 使用统一文本和 semantic status token。
- [x] Dialog/confirmation/feedback 是真正浮层，不产生 card-in-card 或浮动 page section。
- [x] Revision、busy、计数和 selection 文本变化不改变 button/tab/toolbar/statusbar 几何。

## 状态与可访问性

- [x] 所有适用控件覆盖 default、hover、active、focus-visible 和 disabled。
- [x] 可选择控件覆盖 selected/pressed，异步命令覆盖 busy，表单覆盖 readonly/invalid。
- [x] Native、ARIA 和 controller `data-*` 是唯一状态真相；class/computed style 不是状态源。
- [x] Focus ring 不改变 box size、不被裁切，在 dark/light/forced-colors 中清晰可见。
- [x] Disabled 使用 native `disabled`；busy 防止重复操作且保持 accessible status。
- [x] Hover 不作为发现命令或理解状态的唯一方式。
- [x] 状态不只依赖颜色，focus、selected、invalid 和 warning 具有额外轮廓或文本信息。
- [x] 默认表单控件为 30px、compact 控件为 28px、顶栏 icon button 为 30x30px、左工具按钮为
  38x38px，状态 decoration 不改变尺寸。
- [x] Reduced motion 下关闭非必要过渡，pointer/selection/panel geometry 不做视觉动画。

## 工作台视觉与几何

- [x] 工作台保持紧凑、安静、适合高频编辑，不呈现营销页或装饰性 card layout。
- [x] Panel、toolbar、field、status 通过一致 surface/border/spacing/type 建立层级。
- [x] 普通 section/panel 不使用 elevation；shadow 只用于 dialog、overlay、menu 和 canvas。
- [x] 顶栏 48px、状态栏 28px、标尺 20px、工具栏 56px 保持不变。
- [x] 左右 panel 默认 240/288px，resize/collapse 和最小 canvas track 无回归。
- [x] 1024x640 下全部关键控件可用，无 overlap、body overflow 或异常截断。
- [x] 1440x900 和 1920x1080 下密度一致，无过度留白、尺寸漂移或文本遮挡。
- [x] 窄屏只显示既有中文不可编辑提示，不泄漏工作台或新增移动端编辑行为。
- [x] Conflict、import、preview、Blueprint 和 dialog 始终 containment 在 Designer 内。

## Material、宿主与实例隔离

- [x] 含 button/input/style canary 的 Material 未获得 Engine form/button/reset 样式。
- [x] Designer theme 切换不改变 Material 和 Viewer canary computed style。
- [x] Designer stylesheet 不改变 document body、宿主 form/control 或 sibling custom element。
- [x] 两个 Designer 的 style node、theme、focus、dialog 和状态互不影响。
- [x] Disconnect/reconnect 不重复累计 style node，不保留跨实例状态。
- [x] Canvas、selection、guide 和 overlay 仍只承担 Engine authoring chrome。

## 自动化映射

- [x] R1 对应 package/export/import 和 Shadow DOM ownership 测试。
- [x] R2 对应 CSS 分层、装配顺序、单 style node 和 dist consumer 测试。
- [x] R3 对应 token 完整性、theme、contrast、motion 和 forced-colors 测试。
- [x] R4 对应 semantic class、variant、全部 DOM helper 迁移测试。
- [x] R5 对应 form state matrix、label、native keyboard 和 validation 测试。
- [x] R6 对应 ARIA/native state、focus、layout shift 和 accessibility 测试。
- [x] R7 对应三档桌面、窄屏、geometry、overflow 和 containment 测试。
- [x] R8 对应 Material/Viewer/host/multi-instance canary 与 no-side-effect 测试。
- [x] R9 对应 Chromium control gallery、computed style 和 screenshot 证据。
- [x] R10 对应 Engine 聚焦门禁、API/boundary/tarball/browser 与 `pnpm verify:m0`。
- [x] 每个新增 test case 已反向标注其 Requirement，删除或改名时同步本清单映射。

## Screenshot 验收

- [x] Dark/light 控件状态矩阵截图非空、无裁切，并覆盖全部适用状态。
- [x] 1024x640 screenshot 显示完整可编辑工作台且没有重叠。
- [x] 1440x900 screenshot 通过密度、层级、控件一致性和表单可读性人工检查。
- [x] 1920x1080 screenshot 未因宽屏产生失控留白、拉伸或巨大控件。
- [x] 窄屏 screenshot 只显示中文不可编辑提示且不产生 body overflow。
- [x] Screenshot 使用当前代码重新生成，不以历史截图或 Nebula 视觉作为验收依据。
- [x] 自动检查结构、contrast、overflow 和隔离；人工 screenshot 审查不替代自动断言。

## 质量门

- [x] Engine format、lint、typecheck、test 和 build 全部通过。
- [x] Designer browser harness 和控件状态矩阵通过真实 Chromium 验证。
- [x] Static selector/token/dependency checks 通过。
- [x] API report、package boundary、Engine import no-side-effect 检查通过。
- [x] Tarball consumer 无额外 CSS 配置并通过 build/runtime smoke。
- [x] `pnpm verify:m0` 通过，现行 Designer Engine、Viewer 和 Material 行为无回归。
- [x] `tasks.md` 所有适用项有证据并已勾选，本 checklist 不存在未处理适用项。

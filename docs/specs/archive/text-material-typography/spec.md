# Text Material Typography Spec

> 归档：2026-08-30（已完成）
> 状态：生效中（2026-08-16；2026-08-17 增量补充：绝对行高 `lineHeight`）
> 依据：[ADR-0047](../../../decisions/ADR-0047-text-material-typography.md)
> 生效前置：ADR-0047 已接受；本 Spec 为维护期内允许变更官方文本物料 Manifest 与渲染的增量

## 1. 目标

官方文本物料（`base.text`）补齐排版能力：水平对齐（`textAlign`）与垂直对齐（`verticalAlign`）
独立设置，新增字间距（`letterSpacing`）与行间距（`lineSpacing`）。新旧文档零迁移：三个新字段
均为可选，旧文档（未声明新字段）渲染与现状完全一致；ScreenDocument/contracts/catalog 契约
零变化，Designer 属性面板经既有 schema 驱动控件自动呈现新字段。

## 2. Requirements

### R1：Manifest 契约

- `BASE_SCREEN_TEXT_MATERIAL_MANIFEST` 的 `styleSchema` 新增可选字段：
  - `verticalAlign`: `{ kind: 'enum', values: ['top', 'middle', 'bottom'] }`；
  - `letterSpacing`: `{ kind: 'number', minimum: 0, maximum: 100 }`；
  - `lineSpacing`: `{ kind: 'number', minimum: 0, maximum: 512 }`。
- `required` 保持 `['color', 'fontSize', 'fontWeight', 'textAlign']` 不变（新字段全部可选）。
- `defaultStyle` 同步为 `{ color: '#ffffff', fontSize: 32, fontWeight: '400', textAlign: 'left',
  verticalAlign: 'top', letterSpacing: 0, lineSpacing: 0 }`，必须满足 `styleSchema`
  （`parseBaseScreenMaterialManifest` 与 `createMaterialDefinition` 校验通过）。
- `stylePanel` 字段顺序与标签：颜色 → 字号 → 字重 → 水平对齐（`textAlign`，select）→
  垂直对齐（`verticalAlign`，select）→ 字间距（`letterSpacing`，number）→ 行间距
  （`lineSpacing`，number）；既有「对齐」标签改为「水平对齐」。

### R2：渲染

- `BaseScreenTextMaterialElement.renderMaterial()` 对垂直对齐的映射：
  - `verticalAlign` 缺失或 `'top'` → 直接文本节点、`display: block`（现状零回归）；
  - `'middle'`/`'bottom'` → 元素保持 `display: block`（renderer 可见性契约强制元素
    `display: none/block`，物料元素自身的 `display` 不承载布局），文本移入内层 flex
    wrapper（`width/height: 100%`、`align-items: center`/`flex-end`）。
- wrapper 懒创建并复用：首次进入 wrapper 路径时 `replaceChildren()` 清掉直接文本节点
  （避免残留文本把 wrapper 挤到行高之后造成垂直偏移）再挂载 wrapper；回到 `top` 时移除
  wrapper 并恢复直接文本。wrapper 内的文本经继承获得 `text-align`、`letter-spacing`、
  `line-height`、`white-space` 与颜色/字号/字重（这些属性设置在元素上，语义不变）。
- `letterSpacing` 为 number 时设置 `letter-spacing: <n>px`；缺失/非 number 时不设置（清空）。
- `lineSpacing` 为 number 且 `fontSize` 为 number 时设置 `line-height: <fontSize + lineSpacing>px`
  （增量间距语义，行高 = 字号 + 行间距）；任一缺失时不设置 `line-height`。
- 其余既有样式（color/fontSize/fontWeight/textAlign）行为不变；`overflow: hidden` 保持在元素上，
  多行文本块超出容器时按垂直对齐方向对称裁剪。

### R3：兼容性与面板

- 旧文档（style 无 `verticalAlign`/`letterSpacing`/`lineSpacing`）渲染与改动前逐像素一致；
  既有示例工程（playground/browser-harness/host-quickstart 中 `textAlign` 风格对象）无需改动
  仍合法。
- 新拖入的文本组件使用 `defaultStyle`，自动携带 `verticalAlign: 'top'`、`letterSpacing: 0`、
  `lineSpacing: 0`；Designer 属性面板样式区经既有 `select`/`number` 控件自动渲染五个风格字段，
  编辑走既有 schema 校验事务（`createValidatedStyleTransaction`），Engine 零改动。
- ScreenDocument/contracts/catalog 与其他物料契约零变化；无新增依赖、package 或公共 API。

### R4：测试与质量门禁

- material 包聚焦测试覆盖：Manifest 解析校验（含 defaultStyle 满足 schema、panel 引用 schema
  键、字段顺序与标签）、渲染映射矩阵（verticalAlign 三态与缺失、letterSpacing、lineSpacing 与
  fontSize 组合、缺失字段回退、数据状态文本回归）；既有 native-events/conformance/index 测试回归。
- `pnpm verify:m0` 全量通过；基线 README、docs/specs/README.md 与 docs/decisions/README.md 已登记。

## 3. 非目标

- 多行溢出策略（截断/省略号/滚动）、自动换行模式扩展、负字间距、行高倍数语义（1.5× 等）、
  字体族/字重扩展、文本装饰。
- 改变 `textAlign` 既有值语义、ScreenDocument/contracts 契约或其他物料的样式契约。
- 新增依赖、package 或公共 API；Engine/Designer 面板代码改动。

## 4. 完成定义

- `tasks.md` 与 `checklist.md` 全部勾选；测试矩阵与当前实现一致。
- material 聚焦测试、material lint/typecheck/test 与 `pnpm verify:m0` 全部通过；基线 README、
  Spec/ADR 索引已登记。

## 5. 增量补充（2026-08-17）：绝对行高 `lineHeight`

维护期产品反馈驱动的轻量增量（属性面板缺少「行高」表单字段），不新增 ADR/Spec：

- `styleSchema` 新增可选 `lineHeight`：`{ kind: 'number', minimum: 1, maximum: 512 }`；
  `required` 与 `defaultStyle` 不变（行高缺省 = 随字号自适应，新拖入文本与改动前一致）。
- `stylePanel` 在「行间距」前插入 `{ style: 'lineHeight', label: '行高', control: 'number' }`，
  样式区顺序变为 颜色 → 字号 → 字重 → 水平对齐 → 垂直对齐 → 字间距 → 行高 → 行间距。
- 渲染公式扩展为「行高与行间距并存、互不冲突」：
  - `lineHeight` 为 number → `line-height: <lineHeight + (lineSpacing ?? 0)>px`
    （行高为行盒绝对基准，行间距在其上叠加增量）；
  - 否则 `lineSpacing` 与 `fontSize` 均为 number → `line-height: <fontSize + lineSpacing>px`
    （本节既有增量语义，原样保留，旧文档零回归）；
  - 否则不设置 `line-height`。
- 验收：`packages/material/tests/text.test.ts` 新增 lineHeight 渲染矩阵与 Manifest/面板断言，
  既有 lineSpacing 断言（48px/20px/''）全部保留；material lint/typecheck/test 与
  `pnpm verify:m0` 通过（2026-08-17）。
- **补充修复（2026-08-17）**：`middle`/`bottom` wrapper 路径补 `justify-content` 映射
  （`textAlign` left/center/right → `flex-start`/`center`/`flex-end`）——flex 容器内文本节点
  是收缩到内容的匿名 flex item，继承的 `text-align` 只作用于 item 内多行，单行文本会贴左，
  水平对齐因此失效；映射后与块级 `text-align` 等价（多行逐像素一致）。`top` 路径不变。

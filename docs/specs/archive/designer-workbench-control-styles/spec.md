# Designer Workbench Control Styles 规格

> 状态：已归档（历史验收记录）
> 最近更新：2026-08-04
> 阶段：M3 增量
> 定位：冻结 `@base-screen/engine` 私有工作台的设计 token、基础样式、语义控件和视觉验收边界
> 依据：[ADR-0001](../../../decisions/ADR-0001-monorepo-toolchain-and-package-boundaries.md)（已接受）、[ADR-0006](../../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)（已接受）、[Designer Engine Spec](../designer-engine/spec.md)（生效中）
> 实施：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)

## 1. 背景

Designer 已经拥有可运行的 Shadow DOM 工作台和 light/dark 主题，但当前样式集中在
`designer-style.ts` 的单个模板字符串中。工作台布局、按钮、表单、tab、对话框和状态反馈通过不同
层级的后代选择器分别修饰，导致以下问题：

- 输入框、数字输入、select、textarea 和 checkbox 没有统一的尺寸、状态与字段结构。
- 同类按钮在工具栏、面板、冲突提示和导入确认中重复声明边框、背景、间距和交互状态。
- 颜色、圆角、阴影、间距和控件高度散落在工作台规则中，light/dark 主题难以一致演进。
- 裸元素和深层后代选择器容易意外命中 Renderer 挂载到画布中的真实 Material host。
- CSS 与 DOM 结构耦合，修改视觉层时需要在大段 TypeScript 字符串中定位和审查。
- 当前浏览器门禁主要证明几何、交互与非空渲染，不能系统证明全部控件状态的视觉一致性。

本增量规格在 Engine 内建立私有工作台控件样式层。它改善样式的可维护性、完整性和视觉质量，但不把
Engine 变成公共 UI 组件库，也不改变 Designer 的文档、操作、项目或 Material 契约。

## 2. 目标

完成后，Designer 工作台必须具备：

- 由 semantic token 驱动且几何一致的 dark/light 主题。
- 可复用的按钮、图标按钮、字段、文本输入、数字输入、select、textarea、checkbox、颜色 swatch、tab、
  状态和 dialog 私有样式。
- 默认、hover、active、selected、focus-visible、disabled、readonly、invalid 和 busy 的完整状态。
- 安静、紧凑、适合持续编辑和高频操作的大屏工作台视觉，而不是营销页或卡片堆叠布局。
- 独立 CSS 源码、确定的层叠顺序和继续内联到 Designer Shadow Root 的单一交付路径。
- 对宿主页面、Viewer、Renderer Material DOM 和其他 Designer 实例无样式泄漏。
- 可由静态检查、DOM 测试、真实 Chromium 断言和当前截图证据验收的视觉基线。

## 3. 所有权与边界

### 3.1 所有权

| 领域 | 权威所有者 | 本规格允许 Engine 做 | 本规格禁止 Engine 做 |
| --- | --- | --- | --- |
| Designer Shadow DOM chrome | Engine | 定义私有 token、控件类、主题和工作台布局 | 将私有类或 token 声明为公共 SDK 契约 |
| Designer 状态 | Designer Engine Spec | 用既有 ARIA、native 和 `data-*` 状态投影样式 | 从颜色、class 或 computed style 反推 operation/domain 状态 |
| Material 内容与样式 | Material author + Renderer | 为画布、selection 和 overlay 提供编辑器 chrome | reset、normalize 或覆盖 Material host/内部 DOM 的控件样式 |
| Product element 注册 | SDK | 消费未注册的 `BaseScreenDesignerElement` 实现 | 注册新 tag、增加样式专用 product element |
| 构建与包边界 | ADR-0001 | 复用 Engine 现有 TypeScript/Vite library build | 新增 package、CSS runtime、UI framework 或宿主样式安装步骤 |

ADR-0006 已明确 Designer 的 Shadow DOM 内部可替换，因此本规格不需要新增公共边界 ADR。若实施需要新增
外部依赖、公开 CSS export、宿主可配置 theme token、公共控件类型或 SDK 属性，必须暂停实施并先更新
ADR、Designer Engine Spec 和 package boundary。

### 3.2 保持不变的契约

- `BaseScreenDesignerElement` 继续是未注册元素；普通 Engine import 不访问 DOM global 或注册 element。
- 默认主题继续为 dark，`theme="light"` 继续只切换视觉主题；两种主题共享 DOM、文案和几何。
- 48px 顶栏、28px 状态栏、20px 标尺、56px 工具栏、240px 左面板、288px 右面板和
  1024x640 最小编辑尺寸保持不变。
- operation 的 available/enabled、ARIA、native form 状态和现有 `data-*` 属性继续是状态真相。
- Canonical Document、Core history、Renderer、Material ABI、Project Adapter 和 SDK stable tag 不变。
- Engine package 保持 ESM-only、`sideEffects: false`，消费者不需要额外 import CSS。

## 4. 四层样式结构

样式必须按以下顺序组织。后层可以消费前层 token，但不得反向定义前层职责：

| 层 | 职责 | 允许内容 | 禁止内容 |
| --- | --- | --- | --- |
| Tokens | semantic color、spacing、size、radius、type、shadow、motion | `:host` 默认值和 `:host([theme="light"])` token override | 具体控件、布局选择器或业务状态 |
| Base | Engine chrome 的最小基础规则 | `:host`、显式工作台 root 和显式私有控件的 box/font/native appearance 基线 | `.designer *`、裸全局元素 reset 或 Material reset |
| Controls | 可复用私有控件视觉 | field、button、icon button、input、select、textarea、checkbox、tab、status、dialog | 画布几何、领域状态存储或公共组件 API |
| Workbench | Designer 特有结构和编辑辅助层 | rail、toolbar、panel、viewport、ruler、selection、guide、preview | 重复定义通用控件颜色、边框、focus 或 disabled 规则 |

实现应使用独立 CSS 源文件表达以上层次，由一个很小的 TypeScript 装配函数按固定顺序组合。可以使用
CSS cascade layer 固定层叠顺序，但不得依赖消费者 stylesheet 的顺序或宿主 bundler 配置。

不得使用 `!important` 修补组件 specificity。只有 reduced-motion、forced-colors 或 native `[hidden]`
语义确实需要覆盖时才允许使用，并必须由对应浏览器测试证明。组件选择器应保持低 specificity；状态
通过一个私有语义类配合 native/ARIA/`data-*` 属性表达，不通过多层 DOM 路径覆盖。

## 5. CSS 源码与构建

### 5.1 源码形态

- CSS 必须存在于 `packages/engine/src` 内的独立 `.css` 源文件，不继续把完整 stylesheet 写在
  TypeScript 模板字符串中。
- TypeScript 只负责按确定顺序取得编译后的 CSS 文本、创建一个 `<style>` 并放入当前 Designer 的
  Shadow Root。
- CSS 作为字符串进入 Engine JavaScript 产物，不产生必须由消费者加载的全局 stylesheet，也不增加
  `<link>`、`document.head`、constructable stylesheet polyfill 或网络请求。
- Vite 的 CSS 文本导入能力及其 TypeScript 私有声明可以用于构建；不得为此引入 TailwindCSS、
  PostCSS plugin、CSS-in-JS runtime、Sass/Less、React/Vue UI library 或新 workspace package。
- 构建后的 CSS 不成为 package export；类名、token 名和源码文件名均为 Engine 私有实现细节。

### 5.2 样式作用域

- Base 和 Controls 层只能命中 Engine 明确添加的私有 root、class 或属性。
- 禁止使用裸 `button`、`input`、`select`、`textarea`、`label`、`svg` 或 `*` 作为工作台控件入口。
- 禁止使用 `.designer button`、`.properties input` 等依赖容器偶然结构的通用后代 reset。
- Workbench 层可以选择其自有结构节点，但不得选择 `[data-base-screen-component-id]` 或 Material tagName。
- 画布内 Material host 及其 light/shadow DOM 不继承 Engine 控件的 font、color、appearance、border、
  background、outline 或 box model reset。
- 动态节点由创建它的 DOM helper 同时赋予对应私有语义类；不得依赖事后全树扫描补 class。

## 6. Design Tokens

### 6.1 必需 token 家族

Tokens 层至少覆盖：

- Surface：workspace、panel、raised、control、control-hover、overlay、canvas surroundings。
- Text：primary、secondary、muted、disabled、inverse。
- Border：subtle、default、strong，以及 focus ring。
- Semantic：accent、success、warning、danger 及各自低强调 surface/text/border 配对。
- Geometry：2/4/6/8/12/16/24px spacing scale；默认表单控件 30px、compact 控件 28px、顶部图标按钮
  30x30px、左工具按钮 38x38px、常规图标 16x16px，以及统一 panel padding。
- Shape：小于等于 6px 的 control radius；dialog 等真正浮层可以使用不超过 8px 的 radius。
- Typography：12px 工作台正文、11px 辅助文字、等宽或 tabular 数值三类；紧凑标题可以使用 13px，
  letter spacing 固定为 0，不按 viewport 缩放字号。
- Elevation：只用于 overlay、menu/dialog 和 canvas，不把普通 section 或 panel 做成浮动 card。
- Motion：只用于颜色、背景、边框、opacity 等不会推动布局的短过渡；reduced motion 下关闭。

除 `transparent`、`currentColor`、`inherit` 和画布内容自身颜色外，Controls 与 Workbench 层不得散落新的
颜色字面量。新增视觉角色必须先进入 Tokens 层，并同时提供 dark/light 值。

### 6.2 主题要求

- Dark 和 light 只覆盖 semantic token 值，组件规则和稳定尺寸必须共用。
- 主题使用中性 surface 层级、清晰的文本层级和独立的 accent/success/warning/danger 角色，不形成单一
  色相铺满界面的 one-note palette。
- 不使用装饰性 gradient、orb、bokeh 或大面积品牌色；画布网格所需的功能性线性渐变除外。
- 普通正文对背景达到 WCAG AA 4.5:1；大文本和关键图标/边界达到 3:1。
- focus、invalid、selected 和 warning 不得仅用同一种颜色区分，也不得只靠颜色传达含义。
- 原生控件使用与当前主题一致的 `color-scheme`，但浏览器差异不能改变布局尺寸。

## 7. 私有控件系统

### 7.1 语义类

Engine DOM helper 必须通过一组稳定的私有实现类复用视觉规则，至少覆盖：

- field、field label、description、validation message；
- text/number/search input、select、textarea、checkbox 和 Engine 自有 color field；
- text button、icon button 及 primary、neutral、ghost、danger 视觉 variant；
- tab/tablist、segmented control、status/badge、empty state；
- dialog surface、dialog actions 和非模态 feedback surface。

这些类只在 Engine 源码内部稳定，不导出名称、不允许插件贡献、不接受宿主 class 注入。variant 使用
有限、可枚举的 `data-variant`/`data-size`，不得拼接任意 CSS token 或允许 document 数据成为 class 名。

### 7.2 表单控件

- 每个可见字段使用一致的 label/control/description/message 结构；label 与 control 保持真实关联。
- 单行 input、number 和 select 默认高度一致；compact 变体也必须共享同一高度。
- textarea 使用同一边框、字体、padding、focus 和 invalid 规则，并具有稳定最小高度与纵向 resize。
- checkbox 保留原生输入语义和键盘行为，可以自定义视觉，但不得用无语义 `div` 替代。
- select 可以使用 `appearance: none` 和固定图标，但必须保留原生 option、键盘、disabled 和 focus 行为。
- Engine 明确拥有的颜色字段使用可见 native color swatch 与可校验文本值；不得把任意 Material string
  property 猜测为颜色，也不得扩展 Material ABI 来完成本规格。
- 数字、百分比、坐标和尺寸使用等宽数字或 tabular number，动态值不得推动相邻布局。
- placeholder、description 和 validation message 可区分但必须可读；invalid 同时设置 `aria-invalid` 并提供
  固定区域的中文反馈，不能只显示红色边框。
- readonly 与 disabled 视觉可区分：readonly 仍可聚焦和复制，disabled 不可交互。
- 控件内容过长时换行或省略，并通过既有 label/tooltip 提供可访问名称，不允许覆盖相邻控件。

### 7.3 命令与导航控件

- 熟悉命令继续使用固定尺寸图标按钮和 `currentColor` 图标；文字按钮只用于明确命令或不熟悉操作。
- toolbar、tool rail、panel header 和 dialog 中的同类按钮消费同一 button primitive，不重复基础状态规则。
- selected/pressed/tab state 分别读取既有 `aria-selected`、`aria-pressed` 或 operation projection。
- hover/focus/busy 文案、计数、revision 和 selection 数量不得改变按钮、tab、toolbar 或 statusbar 几何。
- 不创建 card-in-card；panel 是工作区域，dialog/confirmation 才使用浮层 surface 和 elevation。

## 8. 状态与可访问性

所有适用控件必须覆盖以下状态：default、hover、active、focus-visible、disabled；可选择控件还必须覆盖
selected/pressed，异步命令覆盖 busy，表单覆盖 readonly/invalid。

- 状态真相来自 native 属性、ARIA 或 controller 已投影的 `data-*`；CSS class 不成为第二状态源。
- `:focus-visible` ring 不改变 box size，不被 panel overflow 无意裁切，并在 dark/light 下均可见。
- disabled 使用 native `disabled`；busy 同时保留稳定尺寸、阻止重复操作并提供既有可访问状态。
- tab、checkbox、select、input、textarea 和 button 保留键盘、输入法、文本选择及复制粘贴行为。
- hover 不能是发现命令或理解状态的唯一方式；`title`/accessible name 和 visible state 继续可用。
- forced colors 下保留边界、focus、selected 和 invalid 的可辨识轮廓。
- pointer 精度优先的大屏工作台中，顶部图标按钮不得小于 28x28px，左工具栏按钮不得小于 38x38px；
  控件的 focus/hover decoration 不得改变这些尺寸。

## 9. 工作台视觉与布局

- 工作台保持安静、实用、信息密集的编辑器视觉；不增加 landing hero、装饰插画、营销文案或大卡片。
- panel、toolbar、field 和 status 的信息层级依靠 surface、border、spacing 和 typography，不依赖多层阴影。
- 固定工作台几何遵守 §3.2；控件迁移不得改变画布可用区域、panel resize/collapse 或 overlay containment。
- 所有固定格式控件使用稳定 width/height、grid track、minmax 或 aspect-ratio，状态变化不得产生 layout shift。
- 1024x640、1440x900 和 1920x1080 下不得有 incoherent overlap、意外 body overflow 或关键控件截断。
- 小于 1024x640 时继续只显示现有中文不可编辑提示，不新增移动端编辑模式。
- dialog、conflict、import、preview 和 Blueprint surface 必须位于 Designer 边界内，长中文和技术 id 不溢出。
- motion 不用于画布几何、panel resize、selection 或 pointer preview；其余短过渡不得妨碍高频操作。

## 10. 验证策略

### 10.1 静态与单元测试

- 静态检查证明 CSS 源文件分层、无 Tailwind/UI framework 依赖、无公共 CSS export，并拒绝高风险裸元素和
  Material 选择器。
- DOM 测试证明全部 Engine 动态控件获得正确私有语义类和 native/ARIA 状态；测试不把 class 当作领域真相。
- token 检查证明非 token 层没有新增颜色字面量，dark/light 的必需 semantic role 成对存在。
- Engine public API snapshot、普通 import no-side-effect 和 package boundary 保持不变。

### 10.2 浏览器视觉验证

使用真实 Chromium 建立仅供测试的控件状态矩阵，覆盖 dark/light 下的：

- text/number/select/textarea/checkbox；
- neutral/primary/ghost/danger button 与 icon button；
- tab、status、field description、invalid message 和 dialog；
- default、focus-visible、disabled、selected/pressed、readonly、invalid、busy。

浏览器门禁必须检查 computed style、固定尺寸、focus ring、contrast、overflow、状态前后 layout shift 和
Material 隔离。每次完成视觉变更时，在 1024x640、1440x900、1920x1080 和窄屏各生成当前 screenshot
证据；截图必须非空、工作台完整可见且经过人工视觉检查。像素快照只有在 CI 字体和平台稳定后才作为
阻断门禁，不能以易漂移快照替代结构、可访问性和隔离断言。

## 11. 非目标

- 不引入 TailwindCSS、第三方 design system、Web Component UI kit、CSS-in-JS runtime 或 icon framework。
- 不创建新的 workspace package、公共控件 Custom Element、公共 CSS class、CSS export 或 host theme API。
- 不允许插件贡献 Designer CSS、theme、panel renderer、arbitrary class 或 stylesheet URL。
- 不重做 Designer 信息架构、中文文案、operation/session、panel capability 或 project workflow。
- 不修改 Viewer/Material 外观，不通过 Engine stylesheet 美化画布内真实物料。
- 不承诺移动端编辑、用户自定义主题、密度切换、品牌换肤或运行时加载主题。
- 不以 Nebula CSS、资产、截图或源码作为实现来源或视觉验收基线。

## 12. Requirements

### R1：私有样式边界

Designer controls SHALL 仅存在于 Engine Shadow DOM 私有实现中，SHALL NOT 新增公共 CSS、控件 API、
外部依赖或消费者安装步骤。

### R2：分层源码与单一注入

Engine SHALL 以 Tokens、Base、Controls、Workbench 四层独立 CSS 源码维护样式，并将编译后的 CSS 文本
通过一个 `<style>` 注入每个 Designer Shadow Root。

### R3：Semantic Token 与双主题

Dark/light SHALL 共享组件规则和几何，仅通过完整 semantic token 集合切换视觉，并满足规定的 contrast、
palette 和 motion 约束。

### R4：可复用私有控件

Engine-created field、form、button、tab、status 和 dialog SHALL 使用显式私有语义类和有限 variant，不得
依赖容器偶然结构或裸元素选择器获得基础视觉。

### R5：完整表单控件

Input、number、select、textarea、checkbox 和 Engine 自有 color field SHALL 具有一致字段结构、稳定尺寸
以及 default、focus、disabled、readonly 和 invalid 行为，同时保留原生语义与键盘能力。

### R6：状态与可访问性

Control state SHALL 只投影 native/ARIA/既有 `data-*` 真相，所有适用状态在 dark/light 与 forced-colors
下可辨识，并且不产生 layout shift 或第二状态源。

### R7：工作台视觉与稳定几何

Designer SHALL 呈现紧凑、安静、适合高频编辑的视觉，并保持既有固定区域尺寸、三档桌面无 overlap/
overflow 和窄屏只读提示。

### R8：Material 与宿主隔离

Engine stylesheet SHALL NOT reset、选择或覆盖 Renderer Material、Viewer、宿主 DOM 或其他实例；普通
Engine import 和 package side-effect 契约保持不变。

### R9：可验证视觉基线

实现 SHALL 提供静态、DOM 和 Chromium 证据，覆盖控件状态矩阵、主题、contrast、geometry、overflow、
Material isolation 和当前 screenshot 人工验收。

### R10：无回归交付

实现 SHALL 通过 Engine 聚焦门禁和 `pnpm verify:m0`，且不改变 public API、package graph、Designer
operation/session、canonical Document 或 project lifecycle。

## 13. 验收场景

| 场景 | Given | When | Then |
| --- | --- | --- | --- |
| Dark 默认主题 | Designer 使用默认主题并加载完整 catalog/document | 打开工作台和属性面板 | 所有 shell 与控件使用 dark semantic token，固定几何无变化 |
| Light 主题 | 同一 Designer 设置 `theme="light"` | 切换并遍历相同控件 | 只改变 token 视觉，DOM、文案、尺寸和状态语义不变 |
| 表单矩阵 | 属性面板包含 text/number/select/textarea/checkbox/color | 键盘聚焦、编辑、设为 readonly/disabled/invalid | 控件尺寸一致、状态可辨识、原生输入行为和中文反馈有效 |
| 命令状态 | toolbar/tool rail 同时存在 enabled、disabled、pressed 和 busy 操作 | operation 状态变化 | 控件位置和尺寸不移动，ARIA 与视觉同步，不从 class 反推状态 |
| Material 隔离 | 画布 Material host 含 canary button/input/style | Designer 挂载并切换主题 | canary computed style 不获得 Engine control reset 或 variant |
| 多实例隔离 | 页面挂载两个不同主题 Designer | 分别操作 focus、panel 和 dialog | stylesheet 与状态只作用于各自 Shadow Root |
| 桌面几何 | viewport 为 1024x640、1440x900、1920x1080 | 打开 panel/dialog/preview 并遍历状态 | 无 overlap、body overflow、关键文本截断或固定区域漂移 |
| 窄屏 | viewport 小于 1024x640 | 挂载 Designer | 只显示既有中文提示，工作台控件不溢出宿主页面 |
| Package 消费 | 空白 ESM consumer 只 import Engine/SDK | build、import 和创建 Designer | 不要求 import CSS，不写 document head，不增加注册/storage 副作用 |

## 14. 完成定义

只有同时满足以下条件，本增量规格才完成：

1. `tasks.md` 中所有适用 Task 与子项均有当前代码或自动化证据并已勾选。
2. `checklist.md` 中所有适用验收项均已逐项核实，R1-R10 均映射到具体测试。
3. 大型 TypeScript 样式字符串已移除，四层 CSS 源码和单一 Shadow Root 注入成为唯一实现。
4. 全部既有和动态生成控件已迁移到私有语义控件层，无高风险裸元素/Material selector。
5. Dark/light 控件状态矩阵、三档桌面、窄屏和 Material canary 浏览器验收通过，并保留当前截图证据。
6. Engine format、lint、typecheck、test、build、browser、API、boundary、import、tarball 门禁通过。
7. `pnpm verify:m0` 通过，且 public API、package graph 和现行 Designer Engine 行为无回归。

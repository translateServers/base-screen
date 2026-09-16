# ADR-0085: 文本与图片物料的作者契约

> 状态：已接受
> 日期：2026-09-16
> 性质：主线合并记录——不引入新决策，只把既有已接受 ADR 收敛为一份现行表述
> 归并范围：ADR-0047、ADR-0056、ADR-0065（被吸收记录已随本次合并移除，内容只在 git 历史中保留）
> 关联：[ADR-0003](./ADR-0003-web-component-material-abi-and-registration.md)（物料 ABI 与 Manifest 契约）、[ADR-0016](./ADR-0016-material-appearance-authoring-contract.md)（声明式外观作者契约）、[ADR-0027](./ADR-0027-lightweight-designer-foundation-host-processing.md)（轻量设计器基座与宿主职责）、ADR-0040、[ADR-0052](./ADR-0052-designer-canvas-text-editing.md)

## 背景

官方文本物料（`base.text`）与官方图片物料是大屏里最常被使用的两个作者面素材。三条先后落地的决策分别补齐了它们的能力：文本排版（水平/垂直对齐分离、字间距、行间距）、文本自适应宽度与运行时几何、图片物料的有界 URL 校验与失败回退。三者共享同一条边界——**物料只描述自己怎么渲染，尺寸与几何的持久语义归 canonical 文档**——却分散在三份记录里，读者很难看出「排版样式改变盒子内部」与「自适应只改变盒子宽度的显示」是两件事。

本记录把这三条主线收敛为一份现行表述：不新增能力、不放宽或收紧任何既有语义，只按主题重新组织，并显式写清 0047 与 0065 的分工以及渲染盒不变式。

## 决策

### 1. 水平对齐与垂直对齐分离

- `textAlign`（left/center/right）语义收窄为「水平对齐」，面板标签由「对齐」改为「水平对齐」，仍直映射 CSS `text-align`；契约值不变，旧文档零迁移。
- 新增 `verticalAlign`（enum：`top`/`middle`/`bottom`）「垂直对齐」。渲染映射：缺失或 `top` → 直接文本节点、元素保持 `display: block`（与既有行为逐像素一致）；`middle`/`bottom` → 元素仍为 `display: block`，文本移入内层 flex wrapper（`width/height: 100%`、`align-items: center`/`flex-end`）。
- wrapper 机制具有必然性：renderer 按组件可见性契约强制元素 `display: none/block`（renderer 测试锁定该行为），物料元素自身的 `display` 不承载布局，垂直对齐只能经内层 wrapper 表达，对 renderer 与第三方物料零影响。
- `text-align`、`letter-spacing`、`line-height`、`white-space` 均为继承属性，继续设置在元素上、经继承作用于 wrapper 内文本；`overflow: hidden` 保持在元素上。进入/退出 wrapper 路径时须清理直接文本节点，避免残留文本把 wrapper 挤到行高之后造成垂直偏移。

### 2. 字间距与行间距（增量语义）

- 新增 `letterSpacing`（number，px，取值范围 0..100，可选，缺省不声明），渲染映射 CSS `letter-spacing: <n>px`；不支持负值；新物料默认 `0`。
- 新增 `lineSpacing`（number，px，取值范围 0..512，可选，缺省不声明）。语义是「行距增量」：渲染 `line-height = fontSize + lineSpacing`（px），随字号自适应；新物料默认 `0`（即行高 = 字号）；缺省不声明时不设置 `line-height`，沿用浏览器默认，旧文档零回归。

### 3. 排版字段的兼容性与面板归属

- 三个新字段全部为可选，不进 `styleSchema.required`；`defaultStyle` 同步携带 `verticalAlign: 'top'`、`letterSpacing: 0`、`lineSpacing: 0`，新拖入文本即带新字段。
- 旧文档（无新字段）渲染与既有表现逐像素一致；ScreenDocument/contracts/catalog 契约零变化；Designer 属性面板经既有 schema 驱动控件（select/number）自动呈现新字段，无需 Engine 改动。
- 样式区字段顺序为：颜色 → 字号 → 字重 → 水平对齐 → 垂直对齐 → 字间距 → 行间距；文案走 Manifest label（物料包内契约），不触碰 `designer-ui-text.ts` 的 UI 文案边界。

### 4. `base.text` 的自适应宽度

- 仅 `base.text` 声明可选布尔属性 `props.autoWidth`，默认关闭（默认 `false`）。缺失保持固定模式，不迁移旧文档。开关复用声明式 Manifest 属性控件，不增加物料 ABI、公共方法、事件、包或依赖。
- 开启时物料使用 `width: max-content` 与 `white-space: pre`：保留空格和手动换行，以最长一行决定宽度，不自动折行。宽度限制为既有尺寸范围 `1..1000000`；位置、高度与画布裁剪规则不变。Designer、直接预览与 Viewer 复用同一物料渲染行为，不异步加载字体来测量宽度。

### 5. 持久尺寸与只读运行时几何分离

- canonical `size.width` 始终为数值，保存固定模式宽度以及不可测量时的备用值；它不是测量结果的镜像。
- 测量值只存于当前 Designer 实例的内部尺寸控制器，由一次同步布局读取与一个共享 `ResizeObserver` 更新。读取未经缩放、旋转的本地 CSS 尺寸，不把视口矩形当作原始宽度。
- Engine 向属性面板、选择框、命中、框选、吸附、对齐、分布、编组与变换提供只读文档几何投影。投影不得传入 Renderer、替换文档、保存、导出或复制，这些路径始终消费 canonical 文档。派生编组边界可在用户编辑事务中读取该投影，但不得把文本的测量宽度连同整份投影写入文档。
- 宿主通过原始 `executeCommand` 或 `executeTransaction` 设置配置时，仍须明确提供 canonical patch；运行时投影不成为公共编辑协议。

### 6. 尺寸编辑与历史语义

- 属性面板、`W` 输入和手势实际改变文本宽度时，在同一 Core transaction 内写入新宽度并关闭自适应；多选及编组缩放逐个处理未锁定成员。只改高度保留原固定宽度，移动和旋转保留开关。用户主动关闭开关时固定为当前显示宽度。取消手势不写文档；撤销、重做沿用既有历史。
- 手势期间冻结几何基准，结束或取消后再同步最新测量。资源刷新只更新渲染与几何，不触发文档 change、脏状态或历史。`W` 输入中的未编辑轴随测量更新，用户正在输入的草稿保持不变。

### 7. 编辑层与生命周期

- 双击编辑层同样使用内容宽度，并保留位置、高度、旋转与翻转；提交只产生一条内容历史，取消恢复原显示。
- 隐藏元素保留最近有效测量，首次不可测量使用文档值，重新显示后同步；组件移除、文档切换及实例卸载时清理观察和缓存。

### 8. 图片物料的有界 URL 校验

- 图片物料渲染端 SHALL 对静态字符串数据源复用 `isBoundedScreenImageUrl`（contracts 导出，与画布背景/封面同规则：接受 `http(s)://`、协议相对、根相对、点相对；拒绝 `data:`/`javascript:`/`blob:`/`file:`/裸相对/控制字符）。
- 非法 URL SHALL 不设置 `img.src`，显示「图片地址无效」占位（fail-closed，杜绝注入面）。不另设校验规则。
- `host-resource` 数据源保持既有语义：数据归宿主，渲染端只对最终字符串做同一校验。

### 9. 图片加载失败的占位回退与契约边界

- `img` 的 `error` 事件 SHALL 移除失效图片并显示「图片加载失败」占位；重复渲染 SHALL 不残留旧图片。
- 占位呈现沿用物料现有状态文案风格（同「图片加载中/图片不可用」），不引入图片资源或新依赖。
- 契约边界：Material Manifest、ScreenDocument、Engine、Renderer、SDK 公共契约零变化，仅图片物料渲染端行为修正。

### 10. 渲染盒不变式与 0047/0065 的边界

- 物料宿主元素的渲染盒必须等于 canonical `component.size`：渲染器先写像素宽高再赋 `model`，因此物料在 `renderMaterial()` 里写宿主元素 `width`/`height` 会覆盖声明尺寸；画边框的物料必须 `box-sizing: border-box`。该不变式由目录级 browser 验证断言兜底，新增物料不遵守即失败。
- 唯一例外是 `base.text` 的自适应宽度：其宽度由引擎测量后投影回文档。
- 两条主线的分工据此划清：0047 讲的是**排版样式**（对齐、字间距、行间距），作用在宿主元素盒子内部的文本排布上，完全由声明式 Manifest 契约承载；0065 讲的是**宽度测量与几何投影**，只影响盒子宽度的显示与编辑，测量值永不写回文档。前者不改变尺寸，后者不改变字体排版，二者共同受渲染盒不变式约束。

## 后果

- 文本物料支持水平/垂直独立对齐、字间距与行间距，覆盖大屏标题/数值文本的常见排版诉求；旧文档与示例工程零迁移、渲染零回归；Manifest 校验（defaultStyle 满足 schema、panel 引用 schema 键）与 Designer 面板自动生效。
- 图片物料对非法 URL fail-closed（不注入、不渲染 broken-image），加载失败有明确占位回退；校验纪律与画布背景/封面一致。
- 文本的数据与排版变化能即时更新可见几何，文档仍然是 JSON-safe 的显式作者配置；不同环境可按各自字体排版重新计算宽度，保存和复制不依赖当前浏览器测量。
- 明确保留为非目标或推迟的事项：
  - 多行溢出策略（截断/省略号/滚动）与自动换行模式扩展。
  - 负字间距、行高倍数（如 1.5×）语义、按比例行距、字体族/字重扩展、文本装饰。
  - 改变 `textAlign` 既有值语义、ScreenDocument/contracts 契约或其他物料的样式契约。
  - 自适应能力不覆盖图片与自定义物料；不提供自适应高度、父容器填充或自定义物料尺寸协议。
  - 图片代理、加载重试、图片格式校验、EXIF 处理；也不修改 URL 校验规则（与画布背景/封面同源）。
  - 上述三条主线均不新增依赖、package 或公共 API。

## 归并范围

| 吸收的 ADR | 生效中的决策要点 | 取代程度 |
| --- | --- | --- |
| ADR-0047 文本物料排版能力（水平/垂直对齐分离、字间距、行间距） | 决策 1–3 全文承接：`textAlign` 收窄为水平对齐、`verticalAlign`（`top`/`middle`/`bottom`）与 wrapper 映射、`letterSpacing` 0..100 px、`lineSpacing` 0..512 px 的增量语义、可选字段与面板顺序；与 0065 共受决策 10 渲染盒不变式约束 | 完全取代（正文保留历史证据） |
| ADR-0056 图片物料 URL 校验与失败回退 | 决策 8–9 全文承接：复用 `isBoundedScreenImageUrl`、「图片地址无效」/「图片加载失败」占位、重复渲染不残留、Manifest/ScreenDocument/Engine/Renderer/SDK 契约零变化 | 完全取代（正文保留历史证据） |
| ADR-0065 文本自适应宽度与运行时几何 | 决策 4–7 全文承接：`props.autoWidth` 默认 `false`、`width: max-content` + `white-space: pre`、宽度上限 1000000、`size.width` 的固定宽度与备用值语义、只读几何投影与尺寸编辑/历史语义 | 完全取代（正文保留历史证据） |

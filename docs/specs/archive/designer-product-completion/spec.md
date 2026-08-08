# Designer Product Completion 规格

> 状态：生效中
> 最近更新：2026-08-05
> 阶段：Designer 产品主线增量
> 定位：补齐大屏设计器底座的作者功能、内容样式、画布精度和工作台质量
> 依据：[ADR-0003](../../../decisions/ADR-0003-web-component-material-abi-and-registration.md)、[ADR-0006](../../../decisions/ADR-0006-designer-engine-dom-interactions-and-history.md)、[ADR-0012](../../../decisions/ADR-0012-designer-project-lifecycle.md)、[Designer Engine Spec](../designer-engine/spec.md)、[Designer Workbench Control Styles Spec](../designer-workbench-control-styles/spec.md)
> 任务：[tasks.md](./tasks.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)
> 来源：[Nebula Designer Core](../../../provenance/nebula-designer-core.md)

## 1. 背景

Base Screen 已具备可运行的 Designer 纵向切片和完整的工作台 chrome 样式基线，但当前能力仍不足以
支撑高频大屏作者工作：官方物料只有文本，内容样式缺少声明式编辑契约，多选拖动、快捷键、图层排序、
动态标尺和组件吸附等基础效率能力仍不完整，数据、交互和蓝图作者界面也只形成最小投影。

现阶段产品方针是围绕大屏设计器的样式和功能推进，其他包只为设计器能力、质量或既有公共契约提供
支撑。本规格将该方针转为可执行增量，并重新建立当前代码到验收证据的可信映射。

## 2. Nebula 参考边界

### 2.1 唯一参考范围

本规格只参考冻结 commit `6e84235897e37af1651f8a84bd5d03aa496c2e35` 中的：

```text
C:\worker\nebula\packages\screen-editor-core
```

允许研究和在授权范围内改编的内容仅包括设计器底座本身：工作台、工具栏、画布、标尺、参考线、
图层、属性面板、快捷键、作者状态、设计器侧数据配置和蓝图作者界面。

### 2.2 明确排除

下列内容不属于本规格的参考或复用范围：

- `packages/screen-sdk` 及其 Custom Element、Shadow DOM、样式入口和宿主装配；
- `apps/web`、`apps/nestjs-server` 与其他应用目录；
- Nebula 的项目列表、路由、认证、数据库、后端、API、dataset DTO 和业务 Store；
- `screen-editor-core` 之外的 Nebula package 实现、配置、样式和资产；
- 第三方生成代码、字体、图标、图片、截图和用户上传内容。

读取被排除模块的 import 类型或行为不得转化为 Base Screen requirements、源码或 fixture。设计器所需的
宿主能力继续以 Base Screen 已接受的 ADR、Contracts 和 Adapter 为唯一依据。

### 2.3 授权与改编

用户已确认其可代表相关版权所有者，授权将指定 `screen-editor-core` 源码或 CSS 改编后纳入 Base Screen，
并以 MIT 许可证分发。该授权不自动覆盖第三方内容，也不允许整包复制。

- 每个直接改编的目标文件必须在实现前记录来源 commit/path、目标文件、修改范围和 attribution 结论。
- React、Tailwind、Radix、Moveable、Selecto、React Flow、Zustand 等实现结构不得绕过 Base Screen 包边界
  整体迁入；需要依赖变化时先更新 ADR、依赖白名单和 package manifest。
- Base Screen 的 framework-neutral DOM、私有 Shadow DOM、中文界面、canonical document、Core history、
  Renderer Material ABI 和实例隔离优先于来源实现。
- 能独立实现且更符合现有架构时，不以“已有授权”为理由复制来源表达。

## 3. 产品原则

1. **核心闭环优先。** 先完成真实物料、内容样式、多选、快捷键、图层和画布精度，再扩展数据与蓝图。
2. **Engine 主导。** 用户工作流由统一 operation、session 和 controller 编排，不从面板 handler 反推领域状态。
3. **声明式作者能力。** Engine 只渲染 Manifest 声明的 props/style/data/event 能力，不按 Material type 特判。
4. **真实物料验收。** 每个创建工具必须对应已启用、可渲染、可编辑、可保存和可预览的真实物料。
5. **一次动作一次历史。** pointer、键盘、图层和检查器入口遵守相同 transaction 与 history 语义。
6. **样式服务工作。** 工作台保持紧凑、安静、可扫描，视觉层级服务高频编辑，不复制来源品牌视觉。
7. **渐进集成。** 数据、交互、事件和蓝图只使用已公开 capability；缺失能力不阻塞基础编辑。
8. **证据优先。** 历史 checklist、Nebula 行为或单张截图不能替代当前代码和自动化证据。

## 4. 所有权边界

| 能力 | 主导包 | 约束 |
| --- | --- | --- |
| 文档、组件、style、data、Blueprint shape | Contracts | strict parse，不增加来源兼容字段 |
| command、transaction、history、geometry、hierarchy | Core | Engine 不复制 mutation 或树算法 |
| 工作台、operation、selection、viewport、gesture | Engine | 私有 Shadow DOM、中文、实例级状态 |
| Material DOM/model/data state | Renderer + Material | Engine 不访问 Material 内部 DOM |
| props/style 作者声明 | Plugin Core | 公共 Manifest 变化必须先有 accepted ADR |
| authoring helper | Plugin SDK | 不依赖 Engine，不执行 UI callback |
| 产品 tag 与聚合入口 | SDK | 本规格不参考或复制 Nebula screen-sdk |
| fixture、conformance、browser helper | Testing | 生产包不得反向依赖 |

## 5. 核心作者闭环

### 5.1 官方基础物料

首批官方物料至少覆盖文本、矩形、椭圆、图片和容器。每个物料必须具有稳定 type/tagName、中文 Manifest、
合法默认 props/style、声明式检查器字段、设计能力和无副作用默认入口。

- 文本支持内容、颜色、字号、字重、对齐和换行。
- 矩形与椭圆支持填充、边框、圆角或适用的形状样式。
- 图片只消费 canonical props 或 Material data state，不保存请求 credential、header 或 transport 配置。
- 容器明确声明 children capability，并通过 Renderer/Core hierarchy 保持子树 painter order。
- 工具未配置或物料未启用时 absent/disabled，不回退到文本或 synthetic Material。

### 5.2 内容样式

Material 外观字段必须由公共声明式契约描述。若现有 `propsSchema/propertyPanel` 无法表达 style，实施前先通过
successor ADR 冻结最小 `styleSchema/stylePanel`、控件类型和验证语义。

Engine 不按 type 猜测颜色、字体或边框。完整 next style 必须先经过声明 schema 验证，再通过 Core command
提交；非法 draft 不改变 document、Renderer 或 history。通用 geometry/status 与 Material style 明确分区。

### 5.3 选择、操作与快捷键

- 在多选集合内按下并拖动时保持多选，所有可移动成员以一个 transaction 提交。
- undo/redo、select all、delete、Escape、方向键微调、复制粘贴、编组和常用对齐由 operation registry 提供。
- toolbar、菜单、快捷键、Layers 和 pointer completion 读取同一 available/enabled 判断。
- 文本输入、输入法、原生 undo、selection 和 copy/paste 不被 Designer shortcut 劫持。
- locked、hidden、不同 parent、不可变换 capability 和 Renderer 拒绝均 fail closed。

### 5.4 图层

图层树必须投影 canonical hierarchy 和 painter order，并支持：

- click 与 modifier 多选、focused selection 同步；
- 节点折叠、搜索、隐藏、锁定和明确状态；
- Enter/blur 提交、Escape 取消的单次重命名历史；
- 同级排序、合法 reparent 和拖回 root；
- 循环、不支持 children、locked parent 和跨非法层级 drop 的确定性拒绝；
- 大集合下不因整树重复测量造成明显输入延迟，具体阈值由测试矩阵冻结。

### 5.5 标尺、参考线与吸附

- 标尺刻度随 pan/zoom 和 device pixel ratio 确定性更新。
- 参考线可从标尺创建、再次拖动、双击删除，并在拖出有效区域时移除。
- 吸附候选包括画布边界、中心、用户参考线、网格和其他可见组件的边缘/中心。
- snap threshold 使用屏幕像素语义，不随 zoom 产生不可控变化。
- 所有辅助状态只属于 Engine instance，不进入 document/history。

## 6. 工作台样式

现有四层 CSS 和 semantic token 继续作为唯一实现基础。允许参考来源工作台的信息密度和反馈层次，
不复制 Tailwind class、品牌 palette 或第三方 UI primitive。

- 顶部命令区清楚区分项目状态、编辑命令和预览/保存类操作，不因动态文案改变几何。
- 左侧物料/图层、中间画布、右侧检查器和底部状态栏形成稳定扫描路径。
- 物料行、图层行、字段、tab、segmented control、菜单、dialog 和 empty state 使用统一 primitive。
- selected、hover、focus、disabled、busy、invalid、readonly、warning 和 conflict 状态完整。
- dark/light 使用同一结构和中文文案，满足 WCAG AA；forced-colors 和 reduced-motion 保持可操作。
- 固定区域继续遵守 48/28/20/56px 和 240/288px 基线；1024x640 以上不重叠，更窄只显示不可编辑提示。
- 画布内容与 Engine chrome 样式隔离；Material、Viewer、宿主和 sibling Designer 不受主题或 selector 污染。

## 7. 渐进能力

### 7.1 数据与交互

数据面板只编辑 canonical `static` 和 `host-resource`。来源中 API、dataset、refresh、URL test 或业务参数
绑定不进入本规格。Material 必须能把 loading/ready/error data state 投影为真实内容或稳定反馈。

交互面板只控制 Base Screen 已公开的 design/preview 行为和 capability，不创建 Material 私有运行状态。

### 7.2 事件与蓝图

事件面板显示 focused component 已声明事件和相关 rule。蓝图作者界面最终应支持 canonical trigger、condition、
value expression、variable action 和已授权 host-event action 的编辑与诊断，但不得复制 React Flow runtime、
私有 layout shape、HTTP/navigation action 或来源执行日志模型。

蓝图图形化呈现是实现选择，不是公共契约。首要验收是 canonical edit、Core compile/evaluate diagnostic、history、
capability gating 和 keyboard accessibility。

## 8. 非目标

- 不参考或复制 `screen-sdk`、Web/NestJS 应用、其他 Nebula package、业务 Store、Router、API 或数据库。
- 不建设项目列表、缩略图、账号、权限、后端保存、dataset 管理或 Nebula 发布流程。
- 不引入 URL/header/token/SQL/script 或任意 executable expression 到 canonical document。
- 不整体引入 React、Vue、Tailwind、Radix、Moveable、Selecto、React Flow、Zustand 或 UI framework。
- 不承诺像素级复刻 Nebula，不复制其品牌色、字体、图标、截图、上传资产或已知缺陷。
- 不改变 Base Screen 中文单语言、实例隔离、默认入口无副作用和固定十二包边界。
- 不在没有 accepted ADR 时改变 Material ABI、Project Adapter、SDK stable tag 或 package graph。

## 9. Requirements

### R1：来源与范围

所有 Nebula 衍生实现 SHALL 只来自冻结的 `packages/screen-editor-core`，具有逐文件 provenance；排除目录、
第三方内容和未记录来源 SHALL NOT 进入源码、fixture、截图或发布产物。

### R2：可信基线

本规格 SHALL 以当前代码和自动化重新验收，不继承旧 checklist 对未实现物料、项目预览、Blueprint 或浏览器
状态矩阵的完成声明。

### R3：真实官方物料

文本、矩形、椭圆、图片和容器工具 SHALL 对应真实、已启用且通过 Manifest/Renderer/Viewer 验证的物料，
不得使用 synthetic 或文本 fallback。

### R4：声明式内容样式

Designer SHALL 只编辑 Manifest 声明且 schema 验证通过的 props/style；公共 style authoring 契约变化 SHALL
在代码前由 accepted ADR 和上游 Spec 冻结。

### R5：统一作者操作

多选移动、快捷键、菜单、图层和 pointer 操作 SHALL 复用 operation 与 Core transaction，每个高层动作最多
产生一个 history entry，失败或取消保持原子不变。

### R6：图层完整性

Layers SHALL 与 canonical hierarchy/painter order/selection 同步，并支持可撤销的重命名、排序、reparent 和
root drop；非法层级变换 SHALL fail closed。

### R7：精确画布

标尺、参考线、网格、组件边缘和中心吸附 SHALL 随 viewport 确定性工作，且全部保持实例级 transient state。

### R8：工作台视觉质量

Designer SHALL 使用私有 semantic token 和统一控件 primitive，在 dark/light、规定 viewport 和可访问状态下
无重叠、溢出、文本遮挡、Material 污染或布局跳动。

### R9：数据与交互渐进集成

Designer SHALL 只投影 canonical data 和公开 interaction capability；Material SHALL 正确呈现 data state，
缺失能力 SHALL 不阻塞基础 authoring。

### R10：Canonical Blueprint 作者能力

事件与蓝图界面 SHALL 只修改 canonical Blueprint、复用 Core compile/evaluate diagnostics 和 runtime
contribution authority，不增加私有 action、layout 或执行器。

### R11：隔离与可访问性

全部新增状态和 UI SHALL 保持 Designer/Material/宿主/多实例隔离，并提供键盘、focus-visible、accessible
name、中文反馈、forced-colors 和 reduced-motion 行为。

### R12：发布级证据

每项能力 SHALL 具有 Requirement 到 unit/DOM/browser/package test 的双向映射，并通过受影响包检查、
browser、tarball、API、boundary 和 `pnpm verify:m0` 后才能勾选完成。

## 10. 完成定义

- `tasks.md` 和 `checklist.md` 不存在未处理适用项。
- 每个实际改编文件已进入 provenance 映射，第三方许可和 attribution 已复核。
- R1-R12 与自动化 case 双向映射完整，规定 viewport 使用当前 Base Screen 代码生成证据。
- 真实官方物料、内容样式、多选、快捷键、图层、画布、数据状态和 Blueprint authoring 形成可演示闭环。
- `pnpm verify:m0` 以及本规格要求的独立 browser/tarball/provenance 检查全部通过。

# Designer Workbench Control Styles 任务

> 状态：已完成（2026-08-04）
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)

本任务集只整改 `@base-screen/engine` 私有 Shadow DOM chrome。每一项只有在实现、自动化证据和对应
checklist 验收同时成立后才能勾选；视觉接近、聚焦测试通过或生成 screenshot 均不能单独代表完成。

- [x] Task 1：冻结私有工作台控件样式规格与边界（R1-R10）。
  - [x] 建立 `spec.md`、`tasks.md`、`checklist.md` 三件套并加入生效中增量索引。
  - [x] 依据 ADR-0001、ADR-0006 和 Designer Engine Spec 冻结 Engine/Renderer/Material/SDK 所有权。
  - [x] 明确四层样式结构、单一 Shadow Root 注入和不新增公共 CSS/API/外部依赖。
  - [x] 明确 TailwindCSS、UI framework、宿主 theme API 和 Material 样式整改均为非目标。

- [x] Task 2：建立分层 CSS 源码和构建装配（R1、R2、R8、R10）。
  - [x] 将 token、base、controls、workbench 移入独立 `.css` 源文件，并固定组合顺序。
  - [x] 将 `designer-style.ts` 收敛为 CSS 文本装配和单一 `<style>` 创建函数。
  - [x] 使用现有 Vite 能力把 CSS 作为字符串打入 Engine JavaScript，不产出必需的外部 stylesheet。
  - [x] 增加 TypeScript 所需的最小私有 CSS 文本 module 声明，不进入 public declaration。
  - [x] 验证 direct Engine/SDK consumer 不需要 CSS import，package 继续 `sideEffects: false`。
  - [x] 删除原有大型 TypeScript stylesheet 字符串，不保留第二份兼容样式。

- [x] Task 3：建立 semantic token 与主题基线（R3、R6、R7）。
  - [x] 建立 surface、text、border、focus、accent、success、warning、danger token 家族。
  - [x] 建立 spacing、control size、icon、radius、typography、elevation 和 motion token 家族。
  - [x] 将 dark 作为默认 token，并以 `:host([theme="light"])` 只覆盖 light 视觉值。
  - [x] 移除 Controls/Workbench 中可由 semantic token 表达的颜色字面量和重复几何值。
  - [x] 校验正文、辅助文字、边界、图标和 focus ring 在两主题下的 WCAG AA contrast。
  - [x] 增加 `color-scheme`、reduced-motion 和 forced-colors 的确定性规则。

- [x] Task 4：实现私有基础控件样式（R4-R7）。
  - [x] 实现 field、label、description、validation message 和稳定 message 区域。
  - [x] 实现 text/number/search input、select、textarea、checkbox 和 Engine 自有 color field primitive。
  - [x] 实现 text button、icon button、primary/neutral/ghost/danger variant 和固定 size。
  - [x] 实现 tab/tablist、segmented control、status/badge、empty state primitive。
  - [x] 实现 dialog、confirmation、feedback surface 和 action row，不形成 card-in-card。
  - [x] 所有 primitive 覆盖适用的 default/hover/active/focus/disabled/readonly/invalid/busy 状态。

- [x] Task 5：迁移全部 Engine 工作台 DOM（R4-R8）。
  - [x] 迁移 workspace 壳层、toolbar、tool rail、panel header、tabs 和 statusbar。
  - [x] 迁移 canvas/property/data/Material property panel 创建的全部动态表单控件；画布颜色使用 swatch，
    不猜测 Material string property。
  - [x] 迁移 Layers 搜索、rename、row action、diagnostic 和空状态。
  - [x] 迁移 conflict、import confirmation、preview 和 Blueprint surface 的控件。
  - [x] DOM helper 在创建节点时直接赋予私有语义类，不做初始化后的全树补丁。
  - [x] 删除裸元素和偶然容器后代控件选择器，不保留旧 class 兼容分支。

- [x] Task 6：验收状态语义与可访问性（R5、R6、R9）。
  - [x] 状态继续来自 native、ARIA 和 operation/controller `data-*`，class 不成为状态源。
  - [x] label/control 关联、accessible name、中文 validation 和 live status 完整。
  - [x] 验收 input/select/textarea/checkbox 的键盘、输入法、文本选择、复制粘贴和 readonly 行为。
  - [x] 验收 button/tab 的 focus-visible、pressed/selected、disabled 和 busy 行为。
  - [x] 验收 forced-colors 与 reduced-motion，不以颜色或 hover 作为唯一信息渠道。
  - [x] 验收全部 focus/hover/state decoration 不改变固定控件 box 或造成 layout shift。

- [x] Task 7：完成工作台视觉与几何收敛（R3、R7、R9）。
  - [x] 统一 panel、toolbar、field、dialog 和 status 的 surface、spacing、type 与 border 层级。
  - [x] 保持 48/28/20/56px 固定区域、240/288px 默认 panel 和既有 resize/collapse 行为。
  - [x] 在 1024x640、1440x900、1920x1080 验证文本、控件、dialog 和 overlay 无重叠/溢出。
  - [x] 在窄屏验证只显示既有中文不可编辑提示，无移动编辑 surface 泄漏。
  - [x] 验证长中文、Material name/type、component id 和 revision 不推动固定控件或遮挡相邻内容。
  - [x] 由当前 Chromium screenshots 完成人工视觉检查，修复不一致的密度、层级和状态。

- [x] Task 8：证明 Shadow DOM、Material 与 package 隔离（R1、R2、R8、R10）。
  - [x] 静态拒绝裸控件 reset、`.designer *`、Material tagName 和 component marker selector。
  - [x] 使用含 button/input/style canary 的 Material 验证 Engine control styles 不命中真实物料。
  - [x] 验证 theme 切换不改变 Material、Viewer、document body 或 sibling Designer computed style。
  - [x] 验证两个 Designer 的主题、focus、dialog 和样式节点完全实例隔离。
  - [x] 验证普通 Engine import 不写 `document.head`、不注册 element、不访问 storage。
  - [x] 验证 build、public declaration、API report、tarball 和 consumer 不出现公共 CSS surface。

- [x] Task 9：建立 R1-R10 自动化证据（R1-R10）。
  - [x] 在本三件套中维护 R1-R10 -> Task -> test case 与 test -> Requirement 双向映射。
  - [x] 单元/DOM 测试覆盖 CSS 装配、语义类、variant 和全部动态控件迁移。
  - [x] 静态检查覆盖分层、token 完整性、颜色字面量、危险 selector 和依赖边界。
  - [x] Chromium 控件矩阵覆盖 dark/light 与全部适用 control state。
  - [x] 浏览器断言覆盖 contrast、computed style、fixed geometry、overflow、layout shift 和 Material isolation。
  - [x] 每个规定 viewport 生成非空当前 screenshot 证据，并记录人工视觉验收结果。

- [x] Task 10：完成质量门和文档收敛（R9、R10）。
  - [x] 运行 Engine format、lint、typecheck、test 和 build。
  - [x] 运行 Designer browser harness、API、package boundary 和 no-side-effect 检查。
  - [x] 运行 tarball consumer，证明消费者无需额外 CSS 配置。
  - [x] 运行 `pnpm verify:m0` 并修复本实施引入的问题。
  - [x] 按 `checklist.md` 逐项核实，未获得证据的项目保持未勾选。
  - [x] 同步 Designer Engine/架构文档中的样式实现状态，不把私有类名写成公共契约。

## 依赖顺序

- Task 1 是全部实施任务的规格前置。
- Task 2 是 Task 3-8 的源码和构建前置。
- Task 3 与 Task 4 可在 Task 2 后并行；Task 5 依赖二者。
- Task 6、Task 7、Task 8 依赖 Task 5，可并行验收并共同约束返工。
- Task 9 随 Task 2-8 增量建立，最终完成依赖 Task 6-8。
- Task 10 依赖 Task 9 和全部实现任务完成。

该任务集不得修改 canonical Document、Core command/history、Renderer Material ABI、Project Adapter、
SDK stable tag 或 package graph。若实现需要任何公共边界或外部依赖变化，必须暂停对应 Task 并先更新
ADR 与上位 Spec。

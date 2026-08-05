# Designer Product Completion 任务

> 状态：已完成
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

本任务集是当前 Designer 产品主线的完成状态机。旧 Designer Spec 和已归档 parity 任务的勾选状态只作为
历史证据，不得继承到本任务集。每个任务只有在实现、自动化、provenance 和对应 checklist 同时成立后
才能勾选。

- [x] Task 1：冻结现行范围、可信基线与来源门禁（R1、R2、R12）。
  - [x] 将本三件套和测试矩阵加入生效中的增量 Spec 索引。
  - [x] 冻结 Nebula commit 和唯一参考目录 `packages/screen-editor-core`。
  - [x] 在 provenance 中记录用户授权、排除目录、第三方内容和逐文件改编模板。
  - [x] 盘点当前 Designer、Renderer、Material、Plugin Core 的真实能力和现有测试，不继承旧 checklist。
  - [x] 对当前过度声明建立 gap 到 Requirement/Task/test case 的映射。
  - [x] 运行实施前 focused tests 与 browser harness，记录可复现 baseline，不以历史通过记录代替。

- [x] Task 2：修复核心闭环的现有正确性缺口（R2、R5、R11、R12）。
  - [x] 修复物料列表事件委托，使点击图标、名称或行内非按钮节点均执行同一 add operation。
  - [x] 修复 Designer/Viewer 在 Renderer 已建立后替换 catalog、resource port 或 contribution authority 的
    配置漂移，或按公开生命周期确定性拒绝并要求 unload。
  - [x] 让 direct preview 的注册前置显式、可诊断且由稳定 SDK 装配满足，不产生运行时空白。
  - [x] 修复 Renderer root subtree painter order，使容器子树不能以内部 zIndex 穿透 sibling root。
  - [x] 避免与 data source 无关的文档编辑无条件重启全部 host-resource resolve。
  - [x] 为上述分支增加 unit/DOM/browser 回归，并更新旧过度声明的证据说明。

- [x] Task 3：冻结声明式内容样式公共契约（R3、R4、R11、R12）。
  - [x] 起草并接受 Material appearance authoring successor ADR。
  - [x] 更新 Plugin Core Contract Spec，冻结最小 style schema、style panel 和 control 集合。
  - [x] 决定 props/style field 是否共享 descriptor、validation 与 control parser，不引入 UI callback。
  - [x] 增加 `color` 等必要声明式控件，并冻结 readonly/invalid/enum/number 边界。
  - [x] 更新 Plugin Core parser、Plugin SDK builder、public API report 和全部 fixture。
  - [x] 私有阶段直接迁移当前 shape，不增加无需求的旧 shape 兼容分支。
  - [x] 在 ADR 接受前不修改公共 Manifest declaration 或 Engine style inspector。

- [x] Task 4：实现真实官方基础物料闭环（R3、R4、R9、R11）。
  - [x] 将 Material package 按物料职责拆分，保持默认入口无注册副作用。
  - [x] 完成文本物料的 props/style 声明、真实 DOM、data state 和标准事件行为。
  - [x] 实现矩形、椭圆、图片和容器物料及中文 Manifest。
  - [x] 图片 source 只使用 canonical value 或 data state，不持久化 transport/credential。
  - [x] 容器遵守 children capability、合法 hierarchy 和 Renderer subtree painter order。
  - [x] 为所有物料提供显式 define 与精确 auto-register 聚合，不注册未声明元素。
  - [x] 更新 Designer harness 的 tool mapping，删除文本 fallback 和 synthetic fixture Material。
  - [x] 增加 native Material conformance、DOM、model update、event、data state 和 no-side-effect 测试。

- [x] Task 5：补齐内容外观检查器（R4、R5、R8、R11）。
  - [x] 将画布设置、通用 geometry/status、Material props 和 Material style 分为清楚的 section。
  - [x] 补齐 rotation、zIndex、opacity 等适用通用字段，不按 type 猜测物料内容样式。
  - [x] 根据 Manifest 渲染 text、number、boolean、select、color 和 JSON 控件。
  - [x] 使用 draft/commit 边界，Enter/blur/change 产生一次 operation，非法 draft 不提交 history。
  - [x] 多选只显示可证明兼容的 geometry/status，不合并异构 props/style。
  - [x] 补齐 `aria-invalid`、label association、中文 validation、readonly 和稳定 message 区域。
  - [x] 验证长中文、type、component id、数值和 enum option 不遮挡相邻控件。

- [x] Task 6：补齐统一作者操作与快捷键（R5、R11）。
  - [x] 在多选成员上开始 drag 时保持 selection，以单次 transaction 移动全部可移动成员。
  - [x] 增加 undo、redo、select all、delete、Escape 和方向键微调 operation。
  - [x] 将 copy/paste、group/ungroup、align/distribute 和常用工具纳入统一 shortcut registry。
  - [x] 冻结 modifier、平台键、重复按键和操作 scope 规则，并在帮助/tooltip 中使用同一 metadata。
  - [x] locked、hidden、不同 parent 和 capability 不兼容时禁用或确定性拒绝，不提交部分选择。
  - [x] input/select/textarea/contenteditable/IME 保留原生文本编辑和快捷键行为。
  - [x] 两个 Designer 的 shortcut、focus、clipboard、active tool 和 pending gesture 完全隔离。

- [x] Task 7：补齐图层树作者工作流（R5、R6、R8、R11）。
  - [x] click、Shift、Ctrl/Cmd selection 与 Canvas 使用同一 interaction reducer。
  - [x] 增加节点折叠状态，搜索结果与 canonical hierarchy/painter order 一致。
  - [x] rename 使用本地 draft，Enter/blur 单次提交，Escape 取消且不产生 history。
  - [x] 增加同级排序、合法 reparent 和拖回 root，drop preview 不成为领域状态。
  - [x] 循环、不支持 children、locked parent、hidden target 和跨非法层级 drop fail closed。
  - [x] hidden/locked/selected/focused/drop-target 状态不只依赖颜色或 hover。
  - [x] 为大集合增加可测的增量渲染或窗口化策略，不引入生产对 Testing 的依赖。

- [x] Task 8：补齐标尺、参考线和智能吸附（R5、R7、R8、R11）。
  - [x] 标尺刻度、标签和原点随 pan/zoom/device pixel ratio 更新。
  - [x] 参考线支持创建、拖动、双击删除和拖出有效区删除。
  - [x] 计算画布边界/中心、用户 guide、网格和可见组件边缘/中心候选。
  - [x] pointer preview 显示当前 snap guide，但不 mutation document/history。
  - [x] threshold 使用 screen pixel 语义，并在 10%-500% zoom 下保持可预测。
  - [x] hidden component 不生成候选；locked component 的候选与 mutation 权限明确分离。
  - [x] pointercancel、lost capture、blur、tool change、replace、unload 和 disconnect 清理临时状态。

- [x] Task 9：完成工作台产品样式收敛（R8、R11）。
  - [x] 以现有 token/base/controls/workbench 四层 CSS 为唯一源码，不引入来源 Tailwind class。
  - [x] 收敛顶部命令区、工具栏、物料行、图层行、检查器 section、状态栏和 overlay 层级。
  - [x] 为全部新增控件提供统一 size、variant、icon、tooltip、focus 和 stable geometry。
  - [x] 补齐 empty/loading/error/disabled/busy/invalid/readonly/conflict 的中文状态面。
  - [x] dark/light 下完成文本、图标、边框、focus 和 semantic color 的 WCAG AA 验证。
  - [x] forced-colors、reduced-motion、长文本、技术 id 和动态数字不产生布局跳动。
  - [x] 在 1024x640、1440x900、1920x1080 和窄屏验证 containment、overflow 与无 overlap。
  - [x] 生成当前 Base Screen 自有 screenshots 并完成人工视觉审查，不提交 Nebula screenshot。

- [x] Task 10：补齐设计器侧数据与交互能力（R9、R11）。
  - [x] Data 继续只提供 canonical static/host-resource，不引入 API、dataset 或 URL test。
  - [x] 使用 runtime contribution authority 验证 resource type 和 params，再提交 canonical data source。
  - [x] official Materials 确定性呈现 idle/loading/ready/error data state。
  - [x] Interaction 只投影已公开 design/preview capability，不创建私有 runtime toggle。
  - [x] capability 缺失时对应 field/tab absent/disabled，基础 authoring 继续可用。
  - [x] 数据配置失败、resource rejection 和 late result 不泄漏 payload、URL、Error 或 credential。

- [x] Task 11：补齐 canonical 事件与蓝图作者能力（R10、R11）。
  - [x] Events 按 focused Material Manifest 列出事件和相关 canonical rule。
  - [x] 支持选择 trigger event、添加/删除/reorder rule，并保持一次操作一次 history。
  - [x] 支持 canonical condition、value expression、variable action 和已授权 host-event action 编辑。
  - [x] 使用 Core compile/evaluate diagnostics 提供固定中文摘要，不复制 evaluator 或执行 host action。
  - [x] runtime contribution authority 决定 capability availability，未知/撤销 capability fail closed。
  - [x] 若使用图形投影，其 layout 只属于 Engine session，不进入 canonical Blueprint。
  - [x] 提供键盘可完成的等价编辑路径，不要求 React Flow 或 pointer-only graph。

- [x] Task 12：完成双向证据、来源审计和质量门（R1-R12）。
  - [x] 更新 [test-matrix.md](./test-matrix.md) 中 R1-R12 -> Task -> exact case 映射。
  - [x] 为每个新增或改编 test case 反向标注 Requirement，并同步 rename/delete。
  - [x] 更新逐文件 provenance，审计第三方许可、attribution 和排除目录未进入产物。
  - [x] 运行受影响 package format、lint、typecheck、test 和 build。
  - [x] 运行 Designer browser、runtime regression、API、boundary 和 no-side-effect checks。
  - [x] 运行 tarball consumer，检查 bundle、`.d.ts`、source map 和 lockfile 无 Nebula 私有路径或依赖。
  - [x] 运行 `pnpm verify:m0` 并修复本规格引入的问题。
  - [x] 按 `checklist.md` 逐项核实；没有当前证据的项目保持未勾选。
  - [x] 同步 Designer 架构状态和当前产品能力，不把私有 DOM/CSS 或来源实现写成公共契约。

## 依赖顺序

- Task 1 是全部实施任务的规格、来源和 baseline 前置。
- Task 2 在新功能前修复现有闭环；其 Renderer painter order 是容器物料的前置。
- Task 3 是 Task 4-5 的公共契约前置，必须先完成 accepted ADR。
- Task 4 是 Task 5、Task 9、Task 10 的真实内容前置。
- Task 5-8 在 Task 2-4 后可按 controller 边界并行，但共同受 operation/history 约束。
- Task 9 随 Task 4-8 增量执行，最终视觉验收依赖这些 DOM 稳定。
- Task 10 依赖 Task 4-5；Task 11 依赖 Task 6 和公开 runtime contribution authority。
- Task 12 随全部任务增量维护，最终完成依赖 Task 1-11。

任何任务需要参考排除目录、新增 package、放宽依赖图或改变 Project Adapter/SDK stable tag 时，必须暂停并
先获得用户确认、更新 ADR/Spec 和 provenance；不得以“补齐 Nebula”作为越界理由。

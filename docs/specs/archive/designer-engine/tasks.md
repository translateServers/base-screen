# Designer Engine 任务

> 状态：按 Engine 主线重新基线化
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)

旧 Designer 增量任务的勾选状态只作为归档实施记录。本任务集按现行 R1-R10 重新验收；已有代码可以
复用，但只有满足当前边界、中文界面和自动化证据后才勾选。

执行记录：Task 8 所依赖的 canonical Blueprint 与 host-resource Core command 边界由
[ADR-0013](../../../decisions/ADR-0013-core-canonical-blueprint-mutation.md) 和 Core Domain Spec 管理；
其余 Task 8 验收仍需逐项以自动化证据完成。

- [x] Task 1：冻结 Engine 主导的现行规格与归档边界（R1-R10）。
  - [x] 将 `designer-engine` 扩展为现行 Spec 三件套。
  - [x] 冻结 Engine、Contracts、Core、Renderer、Plugin Core、SDK 的所有权边界。
  - [x] 冻结简体中文单语言界面和“不做国际化”约束。
  - [x] 将旧 Designer Authoring And Project Lifecycle 三件套移入 archive 并保留进度。
  - [x] 把 Nebula parity 降为历史 provenance，不再作为现行验收基线。

- [x] Task 2：收敛 Engine session 与 operation 架构（R1、R2、R8、R9）。
  - [x] 盘点元素入口、session、viewport、gesture、layers、inspector 和 project controller 的状态所有权。
  - [x] 移除 DOM hidden/class、controller 缓存或 handler 内部形成的第二份领域状态。
  - [x] 建立实例级 operation registry，统一 id、scope、中文 label/tooltip、shortcut 和执行入口。
  - [x] 让 toolbar、快捷键、菜单和 pointer completion 读取同一 available/enabled 判断。
  - [x] 将过大的元素入口按 controller 职责拆分，保持公开 `BaseScreenDesignerElement` 边界稳定。
  - [x] 验证普通 import 不注册 element，也不访问 DOM global、storage 或宿主 service。

- [x] Task 3：完成中文单语言界面（R3、R9、R10）。
  - [x] 建立 Engine 固定中文术语常量，覆盖工具、命令、tab、状态、空状态、确认框和错误摘要。
  - [x] 替换 Engine 自有 visible text、`title`、tooltip、`aria-label` 和 live status 中的英文句子。
  - [x] 以 diagnostic code 选择固定中文摘要，不直接把 diagnostic message/Error/stack 渲染到 UI。
  - [x] 保持 operation id、事件、diagnostic code、document 字段和 Material type 等技术标识不变。
  - [x] 明确 Material Manifest name/label/enum 原样显示，内置 fixture 使用中文作者内容。
  - [x] 增加静态与 DOM 检查，证明不存在 locale/i18n API、翻译字典、语言分支或依赖。

- [x] Task 4：重整工作台壳层与命令状态（R2、R3、R6、R9、R10）。
  - [x] 装配中文工具栏、物料/图层、画布、外观/数据/交互/事件和状态栏。
  - [x] 保持 48px 顶栏、28px 状态栏、20px 标尺、56px 工具栏及面板默认尺寸。
  - [x] 面板折叠/调整、theme、grid、guide 和 zoom 只存于实例，不进入 document/history/storage。
  - [x] available capability 决定控件 absent/present，enabled state 决定稳定 disabled/busy 状态。
  - [x] 小于 1024x640 时显示中文不可编辑提示，并保证 dialog、preview 和宿主页面不溢出。
  - [x] 补齐 tab、tooltip、focus-visible、accessible name 和文本输入快捷键隔离。

- [x] Task 5：验收基础作者编辑闭环（R1、R2、R4、R5、R6、R8）。
  - [x] 验收 click/modifier/marquee/Layers 使用同一 Core interaction state。
  - [x] 验收 select、hand、text、rectangle、ellipse、image、zoom 工具与显式 Material 映射。
  - [x] 验收 drag/resize/rotate/create 的 transient preview、cancel path 和一次历史提交。
  - [x] 验收 group/ungroup/reparent/align/distribute 复用 Core transaction 与 geometry/hierarchy。
  - [x] 验收 clipboard id/parent rewrite、连续偏移、实例隔离和项目切换清理。
  - [x] undo/redo 后统一刷新 selection、overlay、Layers、inspector、dirty 和 command state。
  - [x] Core/Renderer 任一步失败时保持 document/history/selection/DOM 原子不变。

- [x] Task 6：验收检查器与 capability 投影（R2-R6、R9）。
  - [x] 无 selection 时显示中文画布设置；focused selection 显示通用 geometry/status。
  - [x] Manifest propertyPanel/propsSchema 生成白名单控件，完整 next props 先验证再提交。
  - [x] 多选只提供兼容通用字段，不猜测异构 Material props。
  - [x] 数据 tab 只编辑已声明的 canonical static/host-resource source。
  - [x] 交互/事件 tab 只投影现行公开能力，缺失 capability 时 absent/disabled。
  - [x] 非法 JSON、schema mismatch 和缺失 Material 显示稳定中文反馈且不写历史。

- [x] Task 7：验收项目生命周期与中文反馈（R1-R3、R7-R9）。
  - [x] 验收 adapter capability、response parse、opaque revision 和最小披露 diagnostic。
  - [x] 验收 generation、AbortController、mutation serialization、single-flight 和 late response guard。
  - [x] 验收 direct/project baseline、dirty change、save pending edit 和 publish clean precondition。
  - [x] conflict 保留本地状态，只提供中文“继续编辑 / 重新加载远端”与 discard 二次确认。
  - [x] load unavailable 自动 retry 两次；save/publish 只允许显式中文重试。
  - [x] replace/unload/disconnect/dispose 清理 operation、timer、gesture、clipboard 和不适用状态。

- [x] Task 8：完成渐进集成工作流（R2-R7、R9）。
  - [x] Events 展示当前组件 rule 中文摘要并进入同 session 蓝图模式。
  - [x] 蓝图作者投影只修改 canonical Blueprint，复用 Core compile/evaluate diagnostics。
  - [x] Blueprint capability 缺失时不阻塞基础 authoring，也不创建私有 fallback shape。
  - [x] direct document preview 退出后恢复 viewport/selection。
  - [x] project preview 只发送最近成功保存的 projectId/revision。
  - [x] canonical import 先 parse/确认再替换；export 只输出 canonical JSON。
  - [x] legacy input 继续由独立 importer 处理，不在 Engine 内增加兼容分支。

- [x] Task 9：建立现行自动化验收映射（R1-R10）。
  - [x] 建立 R1-R10 -> Task -> test file/case 与 test -> Requirement 双向映射。
  - [x] Vitest 覆盖 session、operation、transaction、project controller 和双实例分支。
  - [x] DOM 测试覆盖中文文本、title/tooltip/aria、tab、disabled/busy/conflict 与检查器。
  - [x] Designer Playwright 覆盖 pointer、keyboard、history、project race 和渐进 capability workflow。
  - [x] 在 1024x640、1440x900、1920x1080 验证几何与无 overlap/overflow。
  - [x] 在窄屏验证中文提示、dialog containment 和 preview，无移动端编辑承诺。
  - [x] 扫描 Engine 自有 UI，拒绝英文句子及任何 locale/i18n 扩展面。

- [x] Task 10：完成质量门与文档收敛（R1-R10）。
  - [x] 运行 Engine 及受影响依赖的 format、lint、typecheck、test 和 build。
  - [x] 运行 API、package boundary、browser、tarball 和 public no-side-effect 检查。
  - [x] 运行 `pnpm verify:m0` 并修复本任务引入的问题。
  - [x] 按 `checklist.md` 逐项验收，不从旧归档清单继承勾选。
  - [x] 同步架构文档中的 Designer Engine 当前能力，不反写实现偶然细节。

## 依赖顺序

- Task 1 是全部任务的规格前置。
- Task 2 是 Task 3-8 的共同架构前置。
- Task 3 与 Task 4 可并行，最终共同约束 Task 5-8 的 UI。
- Task 5、Task 6、Task 7 在 Task 2 后可并行；Task 8 依赖 Task 5-7 的稳定 operation/session。
- Task 9 随 Task 2-8 增量建立，最终验收依赖 Task 3-8。
- Task 10 依赖 Task 9。

该任务集不得修改 canonical document、Material ABI、Project Adapter、SDK tag、Runtime evaluator 或
package graph。确需公共边界变化时先暂停对应 Task，更新 ADR 与权威 Spec 后再实施。

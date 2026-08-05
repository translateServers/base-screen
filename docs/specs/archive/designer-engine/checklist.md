# Designer Engine 验收清单

> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)

本清单按现行 Engine 规格重新验收。旧归档三件套中的勾选项不能替代当前代码、测试和产物证据。
Core canonical Blueprint 与 host-resource command 的公开边界依据 ADR-0013；本清单不会因该前置条件
自动勾选任何 Engine 验收项。

## 文档与边界

- [x] `designer-engine` 是唯一生效中的 Designer 实施三件套。
- [x] 旧 Designer Authoring And Project Lifecycle 三件套已归档并从生效索引移除。
- [x] ADR-0006 与 ADR-0012 仍是 Engine DOM/history/project lifecycle 的有效决策。
- [x] Engine、Contracts、Core、Renderer、Plugin Core 和 SDK 的所有权符合 Spec §3。
- [x] 本实施没有改变 canonical document、Material ABI、Project Adapter 或 SDK stable tag。
- [x] Nebula provenance 只作为历史研究记录，代码与验收不依赖其源码、CSS、资产或截图。

## Engine 主导与状态源

- [x] 每个 Designer 只有一个 session，current document 与 Core history 没有副本。
- [x] selection 只通过 Core interaction reducer 变化，Canvas/Layers/Inspector 不各自存储选择。
- [x] viewport、gesture、panel、clipboard 和 project state 均为实例级明确所有者。
- [x] DOM class、hidden、dataset 或 query result 不充当领域状态。
- [x] `BaseScreenDesignerElement` 只装配公开边界与 controllers，没有继续堆积跨领域流程。
- [x] 默认 Engine import 无 custom element 注册、storage、Router、Store 或宿主 service 副作用。

## Operation 模型

- [x] 每个用户动作有稳定 operation id、scope、中文 label/tooltip 和单一执行入口。
- [x] toolbar、快捷键、菜单和 pointer completion 读取同一 available/enabled 判断。
- [x] capability 缺失决定 absent/disabled，临时状态决定 enabled/busy，不在 handler 静默失败。
- [x] operation failure 返回稳定 diagnostic，并给出与 code 对应的中文反馈。
- [x] 输入控件保留原生文本 undo、selection、copy/paste 和输入法行为。
- [x] operation registry 与状态完全实例隔离。

## 中文单语言

- [x] Engine 自有标题、按钮、菜单、tab、tooltip、状态、空状态和确认框均为简体中文。
- [x] Engine 自有 `title`、`aria-label`、alert/dialog/live region 均为简体中文。
- [x] 工作台不存在完整英文句子；允许技术 id、type、revision、快捷键和数值单位。
- [x] 工具与 tab 使用 Spec §5.2 的固定中文术语，不存在同义词漂移。
- [x] diagnostic message、Error、stack 或 adapter payload 不直接显示在界面。
- [x] Engine 不暴露 locale/language 属性、翻译 key、message dictionary 或运行时语言切换。
- [x] package manifest 和依赖图没有 i18n 库。
- [x] 实现不读取浏览器、系统或宿主 locale。
- [x] Material Manifest 作者文案原样显示；测试 fixture 使用中文 name/property label。

## 工作台

- [x] 左工具栏、物料/图层、中间画布、外观/数据/交互/事件和状态栏结构稳定。
- [x] 顶栏 48px、状态栏 28px、标尺 20px、工具栏 56px，默认面板 240px/288px。
- [x] panel resize/collapse 不改变固定控件尺寸，也不进入 document/history/storage。
- [x] light/dark 共享相同中文词汇，文本、图标和 focus-visible 满足 WCAG AA。
- [x] 图标按钮有中文 tooltip 和 accessible name；tab 键盘与 selected 状态正确。
- [x] busy、disabled、conflict、error 与 focus 状态不导致文本截断或布局跳动。
- [x] 1024x640 及以上无异常 overlap/body overflow；更小尺寸显示中文不可编辑提示。
- [x] 两个 Designer 的 theme、panel、grid、guide、zoom 和 active tool 互不影响。

## 文档与历史

- [x] direct document replace 先 parse/render，失败时保留原 document/history/DOM。
- [x] project load 成功后才替换会话并建立 project baseline。
- [x] 所有持久动作只通过 Core command/transaction，不直接 mutation canonical object。
- [x] Renderer 拒绝时 document、history、selection 和 DOM 保持提交前状态。
- [x] drag/resize/rotate/create 只在 pointer completion 提交一次 history。
- [x] group/ungroup/reparent/align/distribute/paste/property edit 各整体一次 undo。
- [x] pointercancel/lost capture/blur/tool change/replace/unload/disconnect 清除临时预览。
- [x] undo/redo 后 selection、overlay、Layers、Inspector、dirty 和 operation state 一致刷新。

## 选择、工具与画布

- [x] click、blank clear、Shift/Ctrl/Cmd toggle、marquee 与 focused selection 符合 Core 语义。
- [x] hidden component 不可选；locked component 可查看但不可由画布 mutation。
- [x] Canvas 与 Layers selection 双向同步且不存在副本漂移。
- [x] 选择、抓手、文本、矩形、椭圆、图片、缩放工具由统一 registry 提供。
- [x] create tool 只使用显式、已启用的 Material 映射，无 synthetic/fallback type。
- [x] resize/rotate handles 与 pointer command 同时遵守 Material capability 和 locked 状态。
- [x] pan、zoom、grid、guide、snap、marquee 和 transform preview 不进入 document/history。
- [x] clipboard 不跨实例，paste 重写 id/parent，replace/unload/dispose 后旧内容不可用。

## 图层与检查器

- [x] Layers tree 来自 canonical hierarchy/painter order，支持 selection、rename、status 和 reorder。
- [x] group/reparent 保持合法树和画布视觉位置，循环与不兼容 parent fail closed。
- [x] 无 selection 时显示中文画布设置；focused selection 显示通用 geometry/status。
- [x] Material props 只来自 Manifest propertyPanel/propsSchema 白名单。
- [x] 完整 next props 在 command 前验证；非法 draft 不改 document/history/Renderer。
- [x] 多选不猜测或合并异构 Material props。
- [x] Data 只出现 capability 允许的 static/host-resource 字段，无 credential/API/dataset 私有字段。
- [x] 缺失 Material、schema mismatch 和非法 JSON 使用确定性中文反馈。

## 项目生命周期

- [x] adapter capability/method 一致，成功 response 重新 parse，revision 保持 opaque。
- [x] load/save/publish 有 generation、signal、projectId/revision guard 和 mutation serialization。
- [x] new load、replace、unload、disconnect、dispose 中止旧 operation 并清理 retry timer。
- [x] direct/project baseline、dirty event、undo clean 和 save pending edit 符合 ADR-0012。
- [x] publish 只接受 clean ready project，不隐式 save。
- [x] conflict 保留 document/history/selection/revision/baseline。
- [x] 冲突界面只提供中文继续编辑、重新加载远端和必要的丢弃确认。
- [x] load unavailable 只自动 retry 两次；save/publish 不自动 retry。
- [x] 取消、错误、冲突、重试、保存和发布状态不泄漏 Error/stack/payload。

## 渐进集成

- [x] 没有 project adapter 时 direct document authoring、history 与 preview 可用。
- [x] 没有 Host Resource capability 时基础 authoring 可用，Data 对应能力 absent/disabled。
- [x] 没有 Blueprint capability 时基础 authoring 可用，不创建私有 schema 或 fallback。
- [x] Events rule 摘要与蓝图模式投影同一 canonical Blueprint。
- [x] Blueprint edit 通过 Core command/history，Engine 不复制 compiler/evaluator 或执行 host action。
- [x] direct preview 退出后恢复 viewport/selection。
- [x] project preview 只引用最近成功保存的 projectId/revision。
- [x] import 只接受 canonical document，legacy 输入不能绕过 importer。
- [x] export 只产生 canonical serialization，不混入 Engine session state。

## 隔离与清理

- [x] 两个 Designer 不共享 document、history、selection、focus 或 clipboard。
- [x] 两个 Designer 不共享 viewport、tool、guide、grid、panel、theme 或 transient gesture。
- [x] 两个 Designer 不共享 project operation、revision、baseline、retry timer 或 conflict state。
- [x] project replace/unload 清理旧 selection、gesture、clipboard 和 integration mode。
- [x] disconnect/dispose 清理 pointer capture、listener、timer、pending request 和 Renderer 资源。
- [x] 迟到 pointer/project/resource 结果不能修改新会话或已断开的 element。

## 自动化与质量门

- [x] R1-R10 均映射到 Task 与具体自动化 test case，反向映射完整。
- [x] Vitest 覆盖 session、operation、transaction、project controller 与双实例状态分支。
- [x] DOM 测试覆盖中文 visible text/title/tooltip/aria、tab、status、dialog 和 inspector。
- [x] Playwright 覆盖 pointer、keyboard、history、project race、preview、import/export 和 capability 降级。
- [x] 1024x640、1440x900、1920x1080 的工作台无 overlap/overflow/文本截断。
- [x] 窄屏中文提示、dialog containment 和 preview 通过浏览器验证。
- [x] 静态检查拒绝 Engine UI 英文句子、locale/i18n API、字典和依赖。
- [x] diagnostics 与测试产物不包含 credential、业务 Document、adapter Error、stack 或 payload。
- [x] 受影响 package format、lint、typecheck、test 和 build 全部通过。
- [x] API、boundary、browser、tarball、no-side-effect 与 `pnpm verify:m0` 全部通过。

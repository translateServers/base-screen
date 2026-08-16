# Material Library Render Scalability Tasks

> 状态：已完成（2026-08-16，`pnpm verify:fast` 全绿；ADR-0043 提交后补跑通过）

- [x] Task 1：冻结 ADR-0042 与 Spec 四件套；登记 Spec 索引（docs/specs/README.md）、ADR 索引
      （docs/decisions/README.md）与基线 README 能力行；usage.md 11.3 节登记物料库渲染可扩展性
      （R1-R3 文档门禁）。
- [x] Task 2：CSS：`.material-card-wrap` 声明 `content-visibility: auto` 与
      `contain-intrinsic-size: auto 140px`（designer-base.css，含语义注释）；不新增过渡、
      不改变几何与滚动条轨（R1）。
- [x] Task 3：控制器防抖：`designer-panel-controller.ts` 新增 `MATERIAL_SEARCH_DEBOUNCE_MS = 120`
      与 `#materialSearchTimer`；`onInput` 取消旧计时器并调度一次 `renderMaterials`（触发时统一更新
      `#materialSearch`）；`clearMaterialSearch` 立即取消未决计时器并同步渲染；其余路径不变（R2）。
- [x] Task 4：单元测试：fake timers 覆盖——连续输入合并为一次渲染（窗口内再次输入重置计时器）、
      防抖窗口未到不渲染、clear 取消未决计时器且无残留中间态；面板控制器 18 个测试全过（R2）。
- [x] Task 5：harness 断言：物料库卡片计算样式 `content-visibility: auto`（探针实例内卡片）；
      既有搜索断言按防抖时序适配（clear 可见性、分组过滤、空态三处改为 waitFor 等待生效）；
      `pnpm verify:browser` 通过（R1、R3）。
- [x] Task 6：质量门禁：engine 全量测试 442/442、engine 相关文件 biome check、干净提交（9704137）
      全量构建（turbo 12 任务）与 `pnpm verify:browser` 全部通过；ADR-0043 提交（45161dc）后补跑
      `pnpm verify:fast` 全绿（12 任务 + check-packages/check-api/check-engine-import）（R1-R3）。
- [x] Task 7：同步 xjdatahub：从干净提交 9704137 的临时 worktree 打包 engine（不含并行 WIP），
      覆盖 vendor、frontend 重装、验证安装后 bundle 含 CV 规则与 `contain-intrinsic-size: auto 140px`；
      vendor README 增加渲染可扩展性说明（宿主侧无改造要求）；xjdatahub dev `cf565e4..9dbd749`
      已推送。

## 完成记录

（Task 完成后按状态更新上方勾选；最终完成后本行改写为状态行。）

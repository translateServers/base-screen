# Material Library Render Scalability Tasks

> 状态：进行中（2026-08-16）

- [ ] Task 1：冻结 ADR-0042 与 Spec 四件套；登记 Spec 索引（docs/specs/README.md）、ADR 索引
      （docs/decisions/README.md）与基线 README 能力行；usage.md 登记物料库渲染可扩展性行为
      （R1-R3 文档门禁）。
- [ ] Task 2：CSS：`.material-card-wrap` 声明 `content-visibility: auto` 与
      `contain-intrinsic-size: auto 140px`（designer-base.css，含语义注释）；不新增过渡、
      不改变几何与滚动条轨（R1）。
- [ ] Task 3：控制器防抖：`designer-panel-controller.ts` 新增 `MATERIAL_SEARCH_DEBOUNCE_MS = 120`
      与 `#materialSearchTimer`；`onInput` 取消旧计时器并调度一次 `renderMaterials`（触发时统一更新
      `#materialSearch`）；`clearMaterialSearch` 立即取消未决计时器并同步渲染；其余路径不变（R2）。
- [ ] Task 4：单元测试：fake timers 覆盖——连续输入合并为一次渲染（窗口内再次输入重置计时器）、
      防抖窗口未到不渲染、clear 取消未决计时器且无残留中间态（R2）。
- [ ] Task 5：harness 断言：物料库卡片计算样式 `content-visibility: auto`（探针实例内卡片），
      既有封面/几何/分组断言保持通过（R1、R3）。
- [ ] Task 6：质量门禁：engine lint/typecheck/test、`pnpm verify:fast` 与 `pnpm verify:browser`
      全部通过；测试矩阵与实现一致（R1-R3）。
- [ ] Task 7：同步 xjdatahub：重新打包 engine tarball 覆盖 vendor、frontend 重装、验证 CV 渲染
      生效；更新 vendor README 渲染行为小节（宿主侧无改造要求）。

## 完成记录

（Task 完成后按状态更新上方勾选；最终完成后本行改写为状态行。）

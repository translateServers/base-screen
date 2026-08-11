# Designer Theme Tokens 验收清单

> 状态：已完成
> 依据：[spec.md](./spec.md)
> 任务：[tasks.md](./tasks.md)
> 映射：[test-matrix.md](./test-matrix.md)

本清单只按当前代码、自动化输出和当次 browser/screenshot 证据验收。

## 契约和所有权

- [x] ADR-0024 已接受，本 Spec 已转为生效中，并已更新决策/规格索引。
- [x] 仅 `--base-screen-designer-*` 是公共主题输入；`--designer-*`、selector、class、DOM 和布局结构保持私有。
- [x] 宿主只能控制元素外部布局和文档化公共 Token，不能注入 Shadow DOM stylesheet、`::part` 或公共 class。
- [x] Token 不进入 document、history、project payload、日志、fixture 或 host resource intent。
- [x] Viewer、Material appearance、Material scrollbar、宿主和 body scrollbar 不属于 Designer Theme Token 契约。

## Token 和主题

- [x] allowlist 中每项均有 CSS grammar、消费者、private mapping、dark/light fallback 和测试计划。
- [x] `theme` 缺失或未知时为 dark，`theme="light"` 为 light；没有 `theme="system"` 隐式行为。
- [x] inline、宿主 stylesheet、当前 theme fallback、dark fallback 的优先级和删除覆盖后的恢复已验证。
- [x] 内建 dark/light 在文字、图标、border、focus 和状态反馈中满足既有 contrast 要求。
- [x] `text-inverse` 与各 `*-on` 只在具有消费者和 contrast 证据后公开。
- [x] 受限几何 Token 已有范围证据；无法保持工作台 geometry 的候选未公开。
- [x] panel width、topbar/statusbar height、grid track、breakpoint、z-index、icon geometry 和 canvas coordinate 未公开。

## 滚动条和可访问性

- [x] Scrollbar Token 只命中 Engine owned scroll container，包含 thumb、hover、track 和 corner 状态。
- [x] scrollbar width/height 保持私有；浏览器原生 scrollbar 像素差异不作为失败条件。
- [x] Chromium/Safari WebKit 与 Firefox 支持路径具有语义和可读性等价的证据。
- [x] forced-colors 保留系统 scrollbar；reduced-motion 不被外部 Token 绕过。
- [x] 自定义主题下 focus、invalid、disabled、busy、selected 和 warning 不只依赖颜色传达信息。

## 隔离、产物和质量

- [x] 两个 Designer 的 theme、Token、style node、focus 和 overlay 状态互不影响。
- [x] Material、Viewer、body、宿主控件和 sibling Designer computed style 不受影响。
- [x] disconnect/reconnect 和 catalog 延迟初始化不累积 style node 或跨实例状态。
- [x] Controls/Workbench 没有新增可由 Token 表达的颜色字面量、theme branch 或危险 selector。
- [x] 静态、unit、DOM、browser、package 和 tarball case 与 R1-R6 双向映射。
- [x] Engine focused lint、typecheck、test、build、browser、API、boundary、tarball 和 `pnpm verify:m0` 通过。
- [x] `tasks.md` 的全部适用项有当前证据且已勾选。

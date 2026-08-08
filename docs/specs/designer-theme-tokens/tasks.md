# Designer Theme Tokens 任务

> 状态：已暂停
> 当前进行：已暂停，等待现有 Designer group 工作流恢复后重跑浏览器和发布质量门
> 依据：[spec.md](./spec.md)
> 验收：[checklist.md](./checklist.md)
> 映射：[test-matrix.md](./test-matrix.md)

以下任务在 ADR-0024 已接受且本 Spec 转为生效中前不得进入运行时代码实施。

- [x] Task 1：冻结公共主题契约和边界（R1-R4）。
  - [x] 接受 ADR-0024，并将本 Spec 加入生效中索引。
  - [x] 冻结 `--base-screen-designer-*` allowlist、每项 CSS grammar、dark/light fallback 与私有映射。
  - [x] 完成内建主题 contrast 审计，并决定 `text-inverse` 与各 `*-on` 是否进入正式目录。
  - [x] 冻结受限几何 Token 的允许范围；不能证明几何稳定的候选保留私有。
  - [x] 列出 Engine owned scroll container，冻结 scrollbar browser/forced-colors 策略。

- [ ] Task 2：实现 Tokens 层公共输入映射（R1-R3）。
  - [ ] 在 `designer-tokens.css` 维持私有 `--designer-*` 消费点，并接入公共变量 fallback。
  - [ ] 为正式冻结的 semantic foreground Token 建立私有映射和已验证默认值。
  - [ ] 保持 Tokens、Base、Controls、Workbench 的顺序、单 style node 和无覆盖默认视觉。
  - [ ] 不公开内部 selector、layout Token、z-index、DOM class 或新的 JavaScript API。

- [ ] Task 3：实现自有滚动区域主题化（R4）。
  - [ ] 只向 owned scroll container 增加标准 scrollbar 和 WebKit scrollbar 规则。
  - [ ] 接入 thumb、hover、track、corner Token，不修改 scrollbar width/height。
  - [ ] 保持 forced-colors 系统 scrollbar，且不污染 Material、Viewer、宿主或 body。

- [ ] Task 4：建立静态、unit 与 DOM 证据（R1-R5）。
  - [ ] 扩展 `check-designer-styles.mjs`，校验 allowlist、映射、主题 fallback、私有结构不外泄和 scrollbar 范围。
  - [ ] 扩展样式测试，覆盖默认、light、祖先、host、inline 覆盖以及删除后的级联恢复。
  - [ ] 覆盖单 style node、disconnect/reconnect、延迟初始化与双实例隔离。

- [ ] Task 5：完成真实浏览器和发布验证（R2-R6）。
  - [ ] 在 browser harness 覆盖 dark/light、自定义主题、Material/Viewer/host canary、几何、contrast 和截图。
  - [ ] 在可用 Chromium/Safari WebKit 与 Firefox 环境验证 scrollbar 语义、可读性和 forced-colors fallback。
  - [ ] 运行 Engine focused gates、browser、API、boundary、tarball 与 `pnpm verify:m0`。
  - [ ] 更新 test matrix、checklist 和文档索引；所有适用项具备当前自动化证据后再勾选。

## 暂停记录

- 2026-08-07：已完成 ADR-0024 接受、公共目录冻结、Token CSS 映射、Scrollbar 规则、静态门禁和样式单测。
- `pnpm verify:browser` 已通过主题覆盖断言和官方物料注册，但在既有 group 工作流的 `Control+G` 后等待
  `base.container` 创建时超时（`scripts/verify-browser-harness.mjs:572`）。该路径属于并行的 Designer group
  改造，不由本 Spec 修改。用户要求暂停 Theme Tokens 工作，待该路径恢复后从 Task 3/4 的浏览器隔离与
  生命周期证据继续，并完成 Task 5。

# Material Cover Adaptive Fit Tasks

> 状态：已完成（2026-08-16，`pnpm verify:fast` 与 `pnpm verify:browser` 全绿；xjdatahub 已同步）

- [x] Task 1：冻结 ADR-0041 与 Spec 四件套；登记 Spec 索引（docs/specs/README.md）、ADR 索引
      （docs/decisions/README.md）与基线 README 能力行；usage.md 11.2 节登记自适应渲染行为
      （R1-R3 文档门禁）。
- [x] Task 2：engine 自适应决策：`designer-material-library-dom.ts` 新增导出纯函数
      `materialCoverFit(naturalWidth, naturalHeight, boxWidth, boxHeight)`（放大倍数 >1.5 或宽高比
      偏差 >0.35 → `contain`；尺寸非法 → `cover` 安全缺省）；`createMaterialCoverImage` 的 `load`
      处理调用该函数，决策为 `contain` 时在缩略图容器置 `data-material-cover-fit="contain"`
      （R1、R2）。
- [x] Task 3：engine 样式：`.material-thumb[data-material-cover-loaded]` 底色切换为中性表面 Token
      （浅色主题同 Token 自动适配）并隐藏网格 `::before`；`.material-thumb[data-material-cover-fit="contain"]
      .material-cover { object-fit: contain; }`；无新增过渡，reduced-motion 块无需变更；加载前/后/
      回退几何恒定（R2 无抖动）。
- [x] Task 4：engine 单元测试：`materialCoverFit` 决策矩阵——320×200@117×72→cover、
      1920×1080@117×72→cover、605×534@117×72→cover、50×50@117×72→contain（放大）、
      71×17@117×72→contain（放大）、1080×1080@117×72→contain（宽高比）、1920×120@117×72→contain
      （宽高比）、1×1@117×72→contain、尺寸 0/非法→cover；`load` 后 contain 决策在缩略图容器置
      `data-material-cover-fit`，cover 决策不写标记；error 回退占位语义不变（R1、R2）。
- [x] Task 5：harness 探针：托管包新增小尺寸封面物料（200×24 窄条）与 `/tiny-cover.svg`；
      `createCoverProbeDemo` 目录包含该物料；`assertCoverThumbnail` 扩展断言——宽高比正常封面保持
      `object-fit: cover`，窄条封面 `data-material-cover-fit="contain"` 且计算样式 `object-fit:
      contain`、完整可见（R1-R3）。
- [x] Task 6：质量门禁：engine lint/typecheck/test（含 12 个物料库 DOM 测试）、`pnpm verify:fast` 与
      `pnpm verify:browser` 全部通过；测试矩阵与实现一致（R1-R3）。
- [x] Task 7：同步 xjdatahub：重新打包 engine tarball 覆盖 vendor、frontend 重装、验证 contain
      渲染生效（安装后 bundle 含 `data-material-cover-fit=contain` 规则与自适应决策逻辑，vue-tsc 通过）；
      更新 vendor README 渲染行为小节（宿主侧无改造要求）；xjdatahub dev `2dd3973..cf565e4` 已推送。

## 完成记录

（Task 完成后按状态更新上方勾选；最终完成后本行改写为状态行。）

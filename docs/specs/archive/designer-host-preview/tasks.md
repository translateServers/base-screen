# Designer Host Preview Handler Tasks

> 状态：已完成（2026-08-14，`pnpm verify:m0` 与 `pnpm verify:browser` 全绿，宿主浏览器验证预览按钮可用并打开宿主预览页）

- [x] Task 1：冻结 ADR-0038、Spec 四件套并登记 ADR/Spec 索引（R1-R5）。
- [x] Task 2：实现 `previewHandler` 配置字段、RB3 函数校验、只读 getter 与预览操作可用性放宽（R1、R2）。
- [x] Task 3：实现 `togglePreview()` 的处理器接管、`true` 成功、`false`/异常回退与未配置项目模式语义保持（R3、R4）。
- [x] Task 4：补齐聚焦单元测试覆盖配置校验、getter、接管成功与回退（R5）。
- [x] Task 5：运行格式化、聚焦检查与 `pnpm verify:m0`，同步基线与验收证据（R5）。

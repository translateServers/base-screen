# Designer Host Preview Handler Test Matrix

> 状态：已完成（2026-08-14，`pnpm verify:m0` 全绿；宿主浏览器验证预览接管）

| 需求 | 单元测试 | 真实浏览器验证（宿主 xjdatahub） |
| --- | --- | --- |
| R1 配置与 getter | 函数处理器被接受并 getter 可读；非函数被拒绝且零副作用（`designer-runtime-config.test.ts`） | 不适用 |
| R2 可用性放宽 | 直接文档模式与已配置处理器时操作可用（`designer-preview-operations.test.ts`） | 项目模式预览按钮可用（非禁用） |
| R3 接管与回退 | 返回 true 成功、返回 false/异常回退、无处理器项目模式失败语义（`designer-preview-operations.test.ts` + `togglePreview` 路径） | 点击预览打开 viewer draft 页并写入 sessionStorage |
| R4 兼容性 | 既有 previewProject/内置浮层行为不变 | 直接文档模式预览浮层照常工作 |
| R5 集成 | Engine public API 检查 | 宿主 `pnpm build` 通过、编辑器/查看器浏览器验收 |

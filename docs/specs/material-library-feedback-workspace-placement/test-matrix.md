# Material Library Error Console Test Matrix

> 状态：已完成
> 依据：[ADR-0035](../../decisions/ADR-0035-material-library-feedback-workspace-placement.md)

| Requirement | 场景 | 自动化证据 | 状态 |
| --- | --- | --- | --- |
| R1 | 状态栏控制台入口、计数、弹窗和焦点返回 | controller/DOM/style tests、`verify-browser-harness.mjs`、状态栏截图 | 通过 |
| R2 | 状态 surface 位于控制台；错误记录、当前目录状态和宿主动作保持 | controller/DOM tests、`verify-browser-harness.mjs` | 通过 |
| R3 | alert/status、深浅主题、forced-colors、reduced-motion 和网格/画布/状态栏零位移 | style tests、`verify-browser-harness.mjs`、控制台截图 | 通过 |
| R4 | 状态 schema、data-*、无状态路径和公开 API 兼容 | Engine tests、browser harness | 通过 |
| R5 | 格式化、Engine、浏览器和完整交付门禁 | `pnpm verify:browser`、`pnpm verify:m0` | 通过 |

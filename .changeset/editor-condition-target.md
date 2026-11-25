---
'@base-screen/plugin-core': minor
'@base-screen/engine': patch
---

描述符条件新增可选 `target: 'props' | 'style'`：style 字段可以跟随 props 开关显示（例如读数色跟随「显示读数」）。省略时与字段同侧，存量描述符不变（base-screen-docs ADR-0105 P1）。
